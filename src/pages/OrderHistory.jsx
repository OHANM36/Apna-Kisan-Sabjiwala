import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useCart } from '../context/CartContext'
import { formatRupee, formatDate } from '../utils/format'
import Header from '../components/Header'
import Loading from '../components/Loading'

const STORAGE_KEY_CUSTOMER = 'aks_customer_v1'

export default function OrderHistory() {
  const [phone, setPhone] = useState('')
  const [orders, setOrders] = useState(null)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const { addToCart } = useCart()
  const navigate = useNavigate()

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_CUSTOMER) || '{}')
      if (saved.phone) {
        setPhone(saved.phone)
        fetchOrders(saved.phone)
      }
    } catch {
      // कुछ नहीं
    }
  }, [])

  async function fetchOrders(phoneNum) {
    setLoading(true)
    setSearched(true)
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('customer_phone', phoneNum)
      .order('created_at', { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }

  async function handleReorder(order) {
    for (const item of order.order_items) {
      addToCart(
        { id: item.vegetable_id, name: item.vegetable_name, price: item.price, unit: item.unit, emoji: '🥬' },
        item.quantity
      )
    }
    navigate('/cart')
  }

  return (
    <div className="min-h-screen pb-24">
      <Header />
      <div className="px-4 py-4 animate-fade-slide-in">
        <h2 className="font-bold text-gray-800 text-lg mb-3">मेरे ऑर्डर</h2>

        <div className="flex gap-2 mb-4">
          <input
            className="input-field flex-1"
            placeholder="मोबाइल नंबर डालें"
            value={phone}
            inputMode="numeric"
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          />
          <button onClick={() => fetchOrders(phone)} disabled={phone.length !== 10} className="btn-outline px-4 py-0">
            देखें
          </button>
        </div>

        {loading && <Loading text="ऑर्डर लोड हो रहे हैं..." />}

        {!loading && searched && orders?.length === 0 && (
          <div className="text-center py-16">
            <span className="text-6xl mb-3 block">📦</span>
            <p className="text-gray-500 font-medium">इस नंबर पर कोई ऑर्डर नहीं मिला</p>
          </div>
        )}

        {!loading && orders && orders.length > 0 && (
          <div className="flex flex-col gap-3">
            {orders.map((order) => (
              <div key={order.id} className="card p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{order.order_number}</p>
                    <p className="text-xs text-gray-500">{formatDate(order.created_at)}</p>
                  </div>
                  <span className="text-xs font-bold bg-kisan/10 text-kisan px-2 py-1 rounded-full">
                    {order.order_status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  {order.order_items.length} वस्तुएँ • {formatRupee(order.total_amount)} • भुगतान: {order.payment_status}
                </p>
                <div className="flex gap-2 mt-2">
                  <Link to={`/order-confirmation/${order.id}`} className="flex-1 text-center text-xs font-bold border-2 border-kisan text-kisan py-2 rounded-lg">
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
