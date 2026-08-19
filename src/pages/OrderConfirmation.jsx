import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useSettings } from '../context/SettingsContext'
import { buildWhatsAppOrderLink } from '../utils/whatsapp'
import { formatRupee, formatDate, ORDER_STATUS_STEPS } from '../utils/format'
import Header from '../components/Header'
import Loading from '../components/Loading'

export default function OrderConfirmation() {
  const { orderId } = useParams()
  const { settings } = useSettings()
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
  if (!order) return <div className="min-h-screen"><Header /><p className="text-center py-16">ऑर्डर नहीं मिला</p></div>

  const currentStepIndex = ORDER_STATUS_STEPS.indexOf(order.order_status)
  const whatsappLink = buildWhatsAppOrderLink({ order, items, businessWhatsapp: settings.business_whatsapp })

  return (
    <div className="min-h-screen pb-28">
      <Header />
      <div className="px-4 py-6">
        <div className="flex flex-col items-center text-center mb-6">
          <span className="text-6xl mb-2">✅</span>
          <h2 className="font-extrabold text-xl text-gray-800">आपका ऑर्डर सफलतापूर्वक दर्ज हो गया है।</h2>
          <p className="text-gray-500 text-sm mt-1">ऑर्डर नंबर: <span className="font-bold text-kisan">{order.order_number}</span></p>
        </div>

        <div className="card p-4 mb-4">
          <h3 className="font-bold text-gray-700 text-sm mb-3">ऑर्डर की स्थिति</h3>
          <div className="flex flex-col gap-3">
            {ORDER_STATUS_STEPS.map((step, idx) => (
              <div key={step} className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full shrink-0 ${idx <= currentStepIndex ? 'bg-kisan' : 'bg-gray-200'}`} />
                <span className={`text-sm ${idx <= currentStepIndex ? 'text-gray-800 font-semibold' : 'text-gray-400'}`}>{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4 mb-4">
          <h3 className="font-bold text-gray-700 text-sm mb-3">ऑर्डर का विवरण</h3>
          <div className="flex flex-col gap-2 mb-3">
            {items.map((i) => (
              <div key={i.id} className="flex justify-between text-sm">
                <span className="text-gray-600">{i.vegetable_name} x {i.quantity} {i.unit}</span>
                <span className="font-semibold text-gray-800">{formatRupee(i.item_total)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-dashed pt-2 flex flex-col gap-1 text-sm">
            <div className="flex justify-between text-gray-600"><span>सामान का मूल्य</span><span>{formatRupee(order.subtotal)}</span></div>
            <div className="flex justify-between text-gray-600"><span>डिलीवरी शुल्क</span><span>{formatRupee(order.delivery_fee)}</span></div>
            {order.discount > 0 && <div className="flex justify-between text-kisan"><span>छूट</span><span>−{formatRupee(order.discount)}</span></div>}
            <div className="flex justify-between font-extrabold text-gray-800 pt-1"><span>कुल राशि</span><span className="text-kisan">{formatRupee(order.total_amount)}</span></div>
          </div>
        </div>

        <div className="card p-4 mb-4">
          <h3 className="font-bold text-gray-700 text-sm mb-2">डिलीवरी पता</h3>
          <p className="text-sm text-gray-600">{order.customer_name} • {order.customer_phone}</p>
          <p className="text-sm text-gray-600 mt-1">{order.full_address}{order.mohalla ? `, ${order.mohalla}` : ''}, {order.city} - {order.pincode}</p>
          {order.delivery_date && <p className="text-sm text-gray-600 mt-1">{formatDate(order.delivery_date)} • {order.delivery_time_slot}</p>}
          <p className={`text-sm font-bold mt-2 ${order.payment_status === 'सफल' ? 'text-kisan' : 'text-orange-500'}`}>
            भुगतान की स्थिति: {order.payment_status}
          </p>
        </div>

        <a
          href={whatsappLink}
          target="_blank"
          rel="noreferrer"
          className="w-full bg-[#25D366] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform mb-3"
        >
          <span>📱</span> WhatsApp पर ऑर्डर भेजें
        </a>

        <Link to="/orders" className="btn-outline w-full text-center block">मेरे ऑर्डर देखें</Link>
      </div>
    </div>
  )
}
