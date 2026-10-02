import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useCart } from '../context/CartContext'
import { formatRupee, formatDate } from '../utils/format'
import { friendlyError, withTimeout } from '../utils/errors'
import { getMyOrders, saveMyOrder } from '../utils/myOrders'
import { safeJson } from '../utils/safeStorage'
import Header from '../components/Header'
import Loading from '../components/Loading'
import { paymentText } from '../utils/paymentMethods'

const STORAGE_KEY_CUSTOMER = 'aks_customer_v1'

// "मेरे ऑर्डर": फ़ोन नंबर + अपने किसी एक ऑर्डर का नंबर (बिना OTP) — सिर्फ़ फ़ोन नंबर जानना काफ़ी नहीं (C1).
export default function OrderHistory() {
  const saved = safeJson(STORAGE_KEY_CUSTOMER, {}) || {}
  const lastOrder = getMyOrders()[0]
  const [phone, setPhone] = useState(saved.phone || '')
  const [orderNumber, setOrderNumber] = useState(lastOrder?.orderNumber || '')
  const [orders, setOrders] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { addToCart } = useCart()
  const navigate = useNavigate()

  useEffect(() => {
    if (saved.phone && lastOrder?.orderNumber) fetchOrders(saved.phone, lastOrder.orderNumber)
  }, [])

  async function fetchOrders(phoneNum, num) {
    setLoading(true)
    setError('')
    try {
      const { data, error: err } = await withTimeout(
        supabase.rpc('customer_orders', { p_phone: phoneNum, p_order_number: num })
      )
      if (err) throw err
      if (!data?.ok) {
        setOrders(null)
        setError(
          data?.error === 'RATE_LIMITED' ? friendlyError('RATE_LIMITED')
          : data?.error === 'BAD_INPUT' ? 'सही मोबाइल नंबर और ऑर्डर नंबर डालें।'
          : 'ये दोनों मेल नहीं खाते। मोबाइल नंबर और ऑर्डर नंबर दोबारा जाँचें।'
        )
        return
      }
      setOrders(data.orders || [])
      for (const o of data.orders || []) if (o.access_token) saveMyOrder({ id: o.id, token: o.access_token, orderNumber: o.order_number })
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleReorder(order) {
    // पुरानी कीमत नहीं — आज की प्रकाशित कीमत से कार्ट में डालें; बंद/अनुपलब्ध सब्ज़ी छोड़ दें
    const ids = [...new Set(order.order_items.map((i) => i.vegetable_id).filter(Boolean))]
    const { data: vegs } = await supabase.from('vegetables').select('*').in('id', ids).eq('is_active', true)
    let added = 0
    for (const item of order.order_items) {
      const veg = (vegs || []).find((v) => v.id === item.vegetable_id)
      if (!veg || veg.stock_status === 'अनुपलब्ध') continue
      const tier = (veg.price_tiers || []).find((tr) => `${tr.qty} ${tr.unit}` === item.unit)
      if (tier) {
        addToCart({
          id: `${veg.id}::${tier.qty}-${tier.unit}`, vegetableId: veg.id, sellerId: veg.seller_id || null,
          name: veg.name, emoji: veg.emoji, image_url: veg.image_url, price: tier.price, unit: `${tier.qty} ${tier.unit}`,
        }, Number(item.quantity))
      } else {
        addToCart(veg, Number(item.quantity))
      }
      added += 1
    }
    if (added === 0) {
      setError('इस ऑर्डर की कोई सब्ज़ी अभी उपलब्ध नहीं है।')
      return
    }
    navigate('/cart')
  }

  return (
    <div className="min-h-screen pb-24">
      <Header />
      <div className="px-4 py-4 animate-fade-slide-in">
        <h2 className="font-bold text-gray-800 text-lg mb-3">मेरे ऑर्डर</h2>

        <div className="flex flex-col gap-2 mb-4">
          <input
            className="input-field"
            placeholder="मोबाइल नंबर डालें"
            value={phone}
            inputMode="numeric"
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          />
          <input
            className="input-field"
            placeholder="अपना कोई ऑर्डर नंबर डालें (जैसे AKS-...)"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value.slice(0, 40))}
          />
          <button onClick={() => fetchOrders(phone, orderNumber)} disabled={phone.length !== 10 || orderNumber.trim().length < 6 || loading} className="btn-outline">
            देखें
          </button>
          <p className="text-[11px] text-gray-400">आपकी जानकारी की सुरक्षा के लिए ऑर्डर नंबर भी पूछा जाता है। यह आपको ऑर्डर की पुष्टि में मिला था।</p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm font-semibold rounded-xl px-4 py-3 mb-3">{error}</div>}
        {loading && <Loading text="ऑर्डर लोड हो रहे हैं..." />}

        {!loading && orders && orders.length > 0 && (
          <div className="flex flex-col gap-3">
            {orders.map((order) => (
              <div key={order.id} className="card p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{order.order_number}</p>
                    <p className="text-xs text-gray-500">{formatDate(order.created_at)}</p>
                  </div>
                  <span className="text-xs font-bold bg-kisan/10 text-kisan px-2 py-1 rounded-full">{order.order_status}</span>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  {order.order_items.length} वस्तुएँ • {formatRupee(order.total_amount)} • भुगतान: {paymentText(order)}
                </p>
                <div className="flex gap-2 mt-2">
                  <Link to={`/order-confirmation/${order.id}${order.access_token ? `?t=${order.access_token}` : ''}`} className="flex-1 text-center text-xs font-bold border-2 border-kisan text-kisan py-2 rounded-lg">
                    विवरण देखें
                  </Link>
                  <button onClick={() => handleReorder(order)} className="flex-1 text-xs font-bold bg-kisan text-white py-2 rounded-lg">
                    दोबारा ऑर्डर करें
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
