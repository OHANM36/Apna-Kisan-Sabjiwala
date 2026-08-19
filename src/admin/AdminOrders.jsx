import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { formatRupee, formatDate, ORDER_STATUS_STEPS } from '../utils/format'
import Loading from '../components/Loading'

const ALL_STATUSES = [...ORDER_STATUS_STEPS, 'रद्द']

export default function AdminOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('सभी')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    loadOrders()
  }, [])

  async function loadOrders() {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }

  async function updateStatus(orderId, newStatus) {
    await supabase.from('orders').update({ order_status: newStatus }).eq('id', orderId)
    loadOrders()
  }

  const filtered = filter === 'सभी' ? orders : orders.filter((o) => o.order_status === filter)

  if (loading) return <Loading />

  return (
    <div>
      <h1 className="font-extrabold text-xl text-gray-800 mb-5">ऑर्डर प्रबंधन</h1>

      <div className="flex gap-2 overflow-x-auto mb-4 no-scrollbar">
        {['सभी', ...ALL_STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border-2 ${
              filter === s ? 'bg-kisan text-white border-kisan' : 'bg-white text-gray-500 border-gray-200'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {filtered.map((o) => (
          <div key={o.id} className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex justify-between items-start cursor-pointer" onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
              <div>
                <p className="font-bold text-gray-800 text-sm">{o.order_number}</p>
                <p className="text-xs text-gray-500">{o.customer_name} • {o.customer_phone}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(o.created_at)}</p>
              </div>
              <div className="text-right">
                <p className="font-extrabold text-gray-800">{formatRupee(o.total_amount)}</p>
                <p className={`text-xs font-bold ${o.payment_status === 'सफल' ? 'text-kisan' : 'text-orange-500'}`}>
                  भुगतान: {o.payment_status}
                </p>
              </div>
            </div>

            {expanded === o.id && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2">{o.full_address}{o.mohalla ? `, ${o.mohalla}` : ''}, {o.city} - {o.pincode}</p>
                <p className="text-xs text-gray-500 mb-2">डिलीवरी: {o.delivery_date} • {o.delivery_time_slot}</p>
                <div className="flex flex-col gap-1 mb-3">
                  {o.order_items.map((i) => (
                    <div key={i.id} className="flex justify-between text-xs text-gray-600">
                      <span>{i.vegetable_name} x {i.quantity} {i.unit}</span>
                      <span>{formatRupee(i.item_total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3">
              <label className="text-xs font-semibold text-gray-500">ऑर्डर की स्थिति बदलें:</label>
              <select
                value={o.order_status}
                onChange={(e) => updateStatus(o.id, e.target.value)}
                className="input-field mt-1 text-sm py-2"
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-gray-400 text-center py-10">इस स्थिति में कोई ऑर्डर नहीं</p>}
      </div>
    </div>
  )
}
