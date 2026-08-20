import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useSellerAuth } from '../context/SellerAuthContext'
import { formatRupee, formatDate } from '../utils/format'
import Loading from '../components/Loading'

export default function SellerOrders() {
  const { session } = useSellerAuth()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadOrders()
  }, [])

  async function loadOrders() {
    setLoading(true)
    const { data } = await supabase
      .from('order_items')
      .select('*, orders(order_number, customer_name, customer_phone, full_address, mohalla, city, pincode, delivery_date, delivery_time_slot, payment_status, order_status, created_at)')
      .eq('seller_id', session.user.id)
      .order('created_at', { referencedTable: 'orders', ascending: false })

    // ऑर्डर के हिसाब से items को समूहित करें
    const map = new Map()
    ;(data || []).forEach((item) => {
      const orderId = item.order_id
      if (!map.has(orderId)) {
        map.set(orderId, { order: item.orders, items: [] })
      }
      map.get(orderId).items.push(item)
    })
    setGroups(Array.from(map.values()))
    setLoading(false)
  }

  if (loading) return <Loading />

  return (
    <div>
      <h1 className="font-extrabold text-xl text-gray-800 mb-5">मेरे ऑर्डर</h1>

      <div className="flex flex-col gap-3">
        {groups.map(({ order, items }, idx) => {
          const mySubtotal = items.reduce((s, i) => s + Number(i.item_total), 0)
          return (
            <div key={idx} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-bold text-gray-800 text-sm">{order?.order_number}</p>
                  <p className="text-xs text-gray-500">{order?.customer_name} • {order?.customer_phone}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(order?.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="font-extrabold text-gray-800">{formatRupee(mySubtotal)}</p>
                  <span className="text-xs font-bold bg-kisan/10 text-kisan px-2 py-1 rounded-full">
                    {order?.order_status}
                  </span>
                </div>
              </div>

              <p className="text-xs text-gray-500 mb-2">
                {order?.full_address}{order?.mohalla ? `, ${order.mohalla}` : ''}, {order?.city} - {order?.pincode}
              </p>
              <p className="text-xs text-gray-500 mb-2">डिलीवरी: {order?.delivery_date} • {order?.delivery_time_slot}</p>

              <div className="border-t border-gray-100 pt-2 flex flex-col gap-1">
                <p className="text-xs font-semibold text-gray-500 mb-1">आपकी सब्ज़ियाँ इस ऑर्डर में:</p>
                {items.map((i) => (
                  <div key={i.id} className="flex justify-between text-xs text-gray-600">
                    <span>{i.vegetable_name} x {i.quantity} {i.unit}</span>
                    <span className="font-semibold">{formatRupee(i.item_total)}</span>
                  </div>
                ))}
              </div>

              <p className={`text-xs font-bold mt-2 ${order?.payment_status === 'सफल' ? 'text-kisan' : 'text-orange-500'}`}>
                भुगतान की स्थिति: {order?.payment_status}
              </p>
            </div>
          )
        })}
        {groups.length === 0 && <p className="text-gray-400 text-center py-16">अभी तक कोई ऑर्डर नहीं</p>}
      </div>
    </div>
  )
}
