import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useSettings } from '../context/SettingsContext'
import { buildWhatsAppOrderLink } from '../utils/whatsapp'
import { formatRupee, formatDate, ORDER_STATUS_STEPS } from '../utils/format'
import Header from '../components/Header'
import Loading from '../components/Loading'
import { useLanguage } from '../context/LanguageContext'

export default function OrderConfirmation() {
  const { orderId } = useParams()
  const { settings } = useSettings()
  const { t, tStatus } = useLanguage()
  const [order, setOrder] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadOrder()
  }, [orderId])

  async function loadOrder() {
    setLoading(true)
    const { data: orderData } = await supabase.from('orders').select('*').eq('id', orderId).single()
    const { data: itemsData } = await supabase.from('order_items').select('*').eq('order_id', orderId)
    setOrder(orderData)
    setItems(itemsData || [])
    setLoading(false)
  }

  if (loading) return <div className="min-h-screen"><Header /><Loading /></div>
  if (!order) return <div className="min-h-screen"><Header /><p className="text-center py-16">{t('order_not_found')}</p></div>

  const currentStepIndex = ORDER_STATUS_STEPS.indexOf(order.order_status)
  const whatsappLink = buildWhatsAppOrderLink({ order, items, businessWhatsapp: settings.business_whatsapp })

  return (
    <div className="min-h-screen pb-28">
      <Header />
      <div className="px-4 py-6 animate-fade-slide-in">
        <div className="flex flex-col items-center text-center mb-6">
          <span className="text-6xl mb-2">✅</span>
          <h2 className="font-extrabold text-xl text-gray-800">{t('order_success')}</h2>
          <p className="text-gray-500 text-sm mt-1">{t('order_number')}: <span className="font-bold text-kisan">{order.order_number}</span></p>
        </div>

        <div className="card p-4 mb-4">
          <h3 className="font-bold text-gray-700 text-sm mb-3">{t('order_status_title')}</h3>
          <div className="flex flex-col gap-3">
            {ORDER_STATUS_STEPS.map((step, idx) => (
              <div key={step} className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full shrink-0 ${idx <= currentStepIndex ? 'bg-kisan' : 'bg-gray-200'}`} />
                <span className={`text-sm ${idx <= currentStepIndex ? 'text-gray-800 font-semibold' : 'text-gray-400'}`}>{tStatus(step)}</span>
              </div>
            ))}
          </div>
        </div>

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
          <p className={`text-sm font-bold mt-2 ${order.payment_status === 'सफल' ? 'text-kisan' : 'text-orange-500'}`}>
            {t('order_payment_status')}: {tStatus(order.payment_status)}
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
