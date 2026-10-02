import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useSellerAuth } from '../context/SellerAuthContext'
import { formatRupee } from '../utils/format'
import { StatsPageSkeleton } from '../components/Skeleton'

export default function SellerDashboard() {
  const { session } = useSellerAuth()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    setLoading(true)
    const sellerId = session.user.id

    const [{ data: vegetables }, { data: items }] = await Promise.all([
      supabase.from('vegetables').select('id, stock_status').eq('seller_id', sellerId),
      supabase.rpc('seller_order_lines'), // सिर्फ़ इस सेलर की अपनी लाइनें (order_items पर सीधी पहुँच बंद है)
    ])

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const paidItems = (items || []).filter((i) => i.orders?.payment_status === 'सफल')
    const todaySales = paidItems
      .filter((i) => new Date(i.orders.created_at) >= todayStart)
      .reduce((s, i) => s + Number(i.item_total), 0)
    const totalSales = paidItems.reduce((s, i) => s + Number(i.item_total), 0)
    const totalOrders = new Set((items || []).map((i) => i.order_id)).size
    const activeVegCount = (vegetables || []).filter((v) => v.stock_status === 'उपलब्ध').length

    setStats({
      todaySales,
      totalSales,
      totalOrders,
      totalVegetables: (vegetables || []).length,
      activeVegCount,
    })
    setLoading(false)
  }

  if (loading || !stats) return <StatsPageSkeleton count={4} />

  const cards = [
    { label: 'आज की बिक्री', value: formatRupee(stats.todaySales), color: 'bg-kisan' },
    { label: 'कुल बिक्री', value: formatRupee(stats.totalSales), color: 'bg-kisan-orange' },
    { label: 'कुल ऑर्डर', value: stats.totalOrders, color: 'bg-blue-600' },
    { label: 'सक्रिय सब्ज़ियाँ', value: `${stats.activeVegCount} / ${stats.totalVegetables}`, color: 'bg-emerald-600' },
  ]

  return (
    <div>
      <h1 className="font-extrabold text-xl text-gray-800 mb-5">डैशबोर्ड</h1>
      <div className="grid grid-cols-2 gap-4">
        {cards.map((c) => (
          <div key={c.label} className={`${c.color} text-white rounded-2xl p-4 shadow-sm`}>
            <p className="text-xs opacity-80 font-semibold">{c.label}</p>
            <p className="text-xl font-extrabold mt-1">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
