import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { formatRupee } from '../utils/format'
import Loading from '../components/Loading'

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [recentOrders, setRecentOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    setLoading(true)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [{ data: orders }, { data: recent }] = await Promise.all([
      supabase.from('orders').select('total_amount, order_status, payment_status, created_at'),
      supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(5),
    ])

    const all = orders || []
    const todaySales = all
      .filter((o) => new Date(o.created_at) >= todayStart && o.payment_status === 'सफल')
      .reduce((s, o) => s + Number(o.total_amount), 0)

    const totalOrders = all.length
    const completed = all.filter((o) => o.order_status === 'डिलीवरी पूरी हुई').length
    const cancelled = all.filter((o) => o.order_status === 'रद्द').length
    const totalPaid = all.filter((o) => o.payment_status === 'सफल').reduce((s, o) => s + Number(o.total_amount), 0)

    setStats({ todaySales, totalOrders, completed, cancelled, totalPaid })
    setRecentOrders(recent || [])
    setLoading(false)
  }

  if (loading) return <Loading />

  const cards = [
    { label: 'आज की बिक्री', value: formatRupee(stats.todaySales), color: 'bg-kisan' },
    { label: 'कुल ऑर्डर', value: stats.totalOrders, color: 'bg-blue-600' },
    { label: 'पूरे हुए ऑर्डर', value: stats.completed, color: 'bg-emerald-600' },
    { label: 'रद्द ऑर्डर', value: stats.cancelled, color: 'bg-red-500' },
    { label: 'कुल भुगतान प्राप्त', value: formatRupee(stats.totalPaid), color: 'bg-kisan-orange' },
  ]

  return (
    <div>
      <h1 className="font-extrabold text-xl text-gray-800 mb-5">डैशबोर्ड</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.label} className={`${c.color} text-white rounded-2xl p-4 shadow-sm`}>
            <p className="text-xs opacity-80 font-semibold">{c.label}</p>
            <p className="text-2xl font-extrabold mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800">हाल के ऑर्डर</h2>
          <Link to="/admin/orders" className="text-kisan text-sm font-bold">सभी देखें</Link>
        </div>
        <div className="flex flex-col divide-y divide-gray-100">
          {recentOrders.map((o) => (
            <div key={o.id} className="py-3 flex justify-between items-center">
              <div>
                <p className="font-semibold text-gray-800 text-sm">{o.order_number}</p>
                <p className="text-xs text-gray-500">{o.customer_name} • {o.customer_phone}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-gray-800 text-sm">{formatRupee(o.total_amount)}</p>
                <p className="text-xs text-gray-500">{o.order_status}</p>
              </div>
            </div>
          ))}
          {recentOrders.length === 0 && <p className="text-gray-400 text-sm py-4 text-center">अभी तक कोई ऑर्डर नहीं</p>}
        </div>
      </div>
    </div>
  )
}
