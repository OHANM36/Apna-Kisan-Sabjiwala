import { useEffect, useState } from 'react'
import { useParams, Link, useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useSettings } from '../context/SettingsContext'
import { buildWhatsAppOrderLink } from '../utils/whatsapp'
import { formatRupee, formatDate, statusStepsFor } from '../utils/format'
import Header from '../components/Header'
import { getOrderToken, saveMyOrder } from '../utils/myOrders'
import { startOnlinePayment } from '../utils/payment'
import { friendlyError, withTimeout } from '../utils/errors'
import { useLanguage } from '../context/LanguageContext'
import { isCod, isPaid } from '../utils/paymentMethods'
import { OrderConfirmationSkeleton } from '../components/Skeleton'

export default function OrderConfirmation() {
  const { orderId } = useParams()
  const { settings } = useSettings()
  const { t, tStatus } = useLanguage()
  const [order, setOrder] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)
  const location = useLocation()
  const [search] = useSearchParams()
  const notice = location.state?.notice || ''

  // ऑर्डर देखने के लिए गोपनीय access_token चाहिए: इसी डिवाइस पर सेव या लिंक में ?t=
  const token = search.get('t') || getOrderToken(orderId)

  async function fetchOrder(silent = false) {
    if (!silent) setLoading(true)
    if (!token) {
      setOrder(null)
      setLoading(false)
      return null
    }
    try {
      const { data, error: err } = await withTimeout(supabase.rpc('get_order_public', { p_order_id: orderId, p_token: token }))
      if (err) throw err
      setOrder(data?.order || null)
      setItems(data?.items || [])
      if (data?.order && search.get('t')) saveMyOrder({ id: orderId, token, orderNumber: data.order.order_number })
      return data?.order || null
    } catch (e) {
      if (!silent) setError(friendlyError(e))
      return null
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrder()
  }, [orderId])

  // भुगतान की पुष्टि बाकी हो (webhook आने तक) तो कुछ देर हर 5 सेकंड में स्थिति जाँचें
  useEffect(() => {
    if (!order || isCod(order) || order.payment_status === 'सफल' || order.order_status === 'रद्द') return
    let tries = 0
    const id = setInterval(async () => {
      tries += 1
      const o = await fetchOrder(true)
      if (tries >= 24 || o?.payment_status === 'सफल') clearInterval(id)
    }, 5000)
    return () => clearInterval(id)
  }, [order?.payment_status, order?.order_status, order?.payment_method, orderId])

  function retryPayment() {
    setPaying(true)
    setError('')
    startOnlinePayment({
      orderId: order.id,
      accessToken: token,
      orderNumber: order.order_number,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      onVerified: async () => { await fetchOrder(true); setPaying(false) },
      onPending: (m) => { setError(m); setPaying(false) },
      onFailure: (m) => { setError(m); setPaying(false) },
    })
  }

  if (loading) return <div className="min-h-screen"><Header /><OrderConfirmationSkeleton /></div>
  if (!order) return (
    <div className="min-h-screen"><Header />
      <div className="text-center py-16 px-6">
        <p>{error || t('order_not_found')}</p>
        <Link to="/orders" className="btn-outline inline-block mt-4 px-5">मेरे ऑर्डर देखें</Link>
      </div>
    </div>
  )

  const statusSteps = statusStepsFor(order)
  const currentStepIndex = statusSteps.indexOf(order.order_status)
  const cod = isCod(order)
  const paid = isPaid(order)
  const cancelled = order.order_status === 'रद्द'
  const heading = paid
    ? { icon: '✅', text: t('order_success') }
    : cod
    ? cancelled
      ? { icon: '❌', text: tStatus('रद्द') }
      : { icon: '✅', text: t('order_cod_placed') }
    : { icon: '⏳', text: 'ऑर्डर बन गया — भुगतान बाकी' }
  const whatsappLink = buildWhatsAppOrderLink({ order, items, businessWhatsapp: settings.business_whatsapp })

  return (
    <div className="min-h-screen pb-28">
      <Header />
      <div className="px-4 py-6 animate-fade-slide-in">
        <div className="flex flex-col items-center text-center mb-6">
          <span className="text-6xl mb-2">{heading.icon}</span>
          <h2 className="font-extrabold text-xl text-gray-800">{heading.text}</h2>
          <p className="text-gray-500 text-sm mt-1">{t('order_number')}: <span className="font-bold text-kisan">{order.order_number}</span></p>
        </div>

        {(notice || error) && (
          <div className="bg-orange-50 border border-orange-200 text-orange-700 text-sm font-semibold rounded-xl px-4 py-3 mb-4">{notice || error}</div>
        )}
        {cod && !paid && !cancelled && (
          <div className="card p-4 mb-4 border-2 border-amber-300 bg-amber-50">
            <p className="text-sm font-bold text-amber-800">💵 {t('order_cod_title')}</p>
            <p className="text-sm text-amber-800 mt-1">{t('order_cod_pay_note').replace('{amount}', formatRupee(order.total_amount))}</p>
          </div>
        )}
        {!cod && order.payment_status !== 'सफल' && order.order_status !== 'रद्द' && (
          <div className="card p-4 mb-4 border-2 border-orange-300">
            <p className="text-sm font-bold text-orange-600 mb-2">भुगतान बाकी है</p>
            <button onClick={retryPayment} disabled={paying} className="btn-primary w-full">
              {paying ? 'प्रोसेस हो रहा है...' : `${formatRupee(order.total_amount)} अभी भुगतान करें`}
            </button>
          </div>
        )}

        <div className="card p-4 mb-4">
          <h3 className="font-bold text-gray-700 text-sm mb-3">{t('order_status_title')}</h3>
          <div className="flex flex-col gap-3">
            {statusSteps.map((step, idx) => (
              <div key={step} className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full shrink-0 ${idx <= currentStepIndex ? 'bg-kisan' : 'bg-gray-200'}`} />
                <span className={`text-sm ${idx <= currentStepIndex ? 'text-gray-800 font-semibold' : 'text-gray-400'}`}>{tStatus(step)}</span>
              </div>
            ))}
          </div>
        </div>

        {order.delivery_pin && !['डिलीवरी पूरी हुई', 'रद्द'].includes(order.order_status) && (
          <div className="card p-4 mb-4 border-2 border-kisan-orange bg-kisan-orange/5">
            <h3 className="font-bold text-gray-700 text-sm mb-1">{t('order_delivery_pin_title')}</h3>
            <p className="text-3xl font-extrabold tracking-[0.4em] text-kisan-dark text-center my-2">{order.delivery_pin}</p>
            <p className="text-xs text-gray-500">{t('order_delivery_pin_note')}</p>
          </div>
        )}

        <div className="card p-4 mb-4">
          <h3 className="font-bold text-gray-700 text-sm mb-3">{t('order_details')}</h3>
          <div className="flex flex-col gap-2 mb-3">
            {items.map((i) => (
              <div key={i.id} className="flex justify-between text-sm items-start">
                <div>
                  <span className="text-gray-600">{i.vegetable_name} x {i.quantity} {i.unit}</span>
                  {i.seller_name && <p className="text-[11px] text-gray-400 font-semibold">🧑‍🌾 {i.seller_name}</p>}
                </div>
                <span className="font-semibold text-gray-800">{formatRupee(i.item_total)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-dashed pt-2 flex flex-col gap-1 text-sm">
            <div className="flex justify-between text-gray-600"><span>{t('cart_subtotal')}</span><span>{formatRupee(order.subtotal)}</span></div>
            <div className="flex justify-between text-gray-600"><span>{t('cart_delivery_fee')}</span><span>{formatRupee(order.delivery_fee)}</span></div>
            {order.discount > 0 && <div className="flex justify-between text-kisan"><span>{t('checkout_discount')}</span><span>−{formatRupee(order.discount)}</span></div>}
            <div className="flex justify-between font-extrabold text-gray-800 pt-1"><span>{t('checkout_total_amount')}</span><span className="text-kisan">{formatRupee(order.total_amount)}</span></div>
          </div>
        </div>

        <div className="card p-4 mb-4">
          <h3 className="font-bold text-gray-700 text-sm mb-2">{t('order_delivery_address')}</h3>
          <p className="text-sm text-gray-600">{order.customer_name} • {order.customer_phone}</p>
          <p className="text-sm text-gray-600 mt-1">{order.full_address}{order.mohalla ? `, ${order.mohalla}` : ''}, {order.city} - {order.pincode}</p>
          {order.delivery_date && <p className="text-sm text-gray-600 mt-1">{formatDate(order.delivery_date)} • {order.delivery_time_slot}</p>}
          <p className={`text-sm font-bold mt-2 ${paid ? 'text-kisan' : 'text-orange-500'}`}>
            {t('order_payment_status')}:{' '}
            {cod ? (paid ? t('order_cod_received') : `${t('order_cod_title')} (${tStatus('लंबित')})`) : tStatus(order.payment_status)}
          </p>
        </div>

        <a
          href={whatsappLink}
          target="_blank"
          rel="noreferrer"
          className="w-full bg-[#25D366] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform mb-3"
        >
          <span>📱</span> {t('order_send_whatsapp')}
        </a>

        <Link to="/orders" className="btn-outline w-full text-center block">{t('order_view_my_orders')}</Link>
      </div>
    </div>
  )
}
