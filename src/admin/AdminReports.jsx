import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { formatRupee } from '../utils/format'
import Loading from '../components/Loading'

export default function AdminReports() {
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState(null)

  useEffect(() => {
    loadReport()
  }, [])

  async function loadReport() {
    setLoading(true)
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(todayStart)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [{ data: orders }, { data: items }] = await Promise.all([
      supabase.from('orders').select('total_amount, order_status, payment_status, created_at'),
      supabase.from('order_items').select('vegetable_name, quantity, item_total'),
    ])

    const paid = (orders || []).filter((o) => o.payment_status === 'सफल')
    const sum = (arr) => arr.reduce((s, o) => s + Number(o.total_amount), 0)

    const todaySales = sum(paid.filter((o) => new Date(o.created_at) >= todayStart))
    const weekSales = sum(paid.filter((o) => new Date(o.created_at) >= weekStart))
    const monthSales = sum(paid.filter((o) => new Date(o.created_at) >= monthStart))
    const totalOrders = (orders || []).length
    const completedOrders = (orders || []).filter((o) => o.order_status === 'डिलीवरी पूरी हुई').length
    const cancelledOrders = (orders || []).filter((o) => o.order_status === 'रद्द').length
    const totalOnlinePayments = sum(paid)

    const vegTotals = {}
    ;(items || []).forEach((i) => {
      vegTotals[i.vegetable_name] = (vegTotals[i.vegetable_name] || 0) + Number(i.quantity)
    })
    const topVegetables = Object.entries(vegTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    setReport({
      todaySales,
      weekSales,
      monthSales,
      totalOrders,
      completedOrders,
      cancelledOrders,
      totalOnlinePayments,
      topVegetables,
    })
    setLoading(false)
  }

  if (loading) return <Loading />

  const cards = [
    { label: 'आज की बिक्री', value: formatRupee(report.todaySales) },
    { label: 'इस सप्ताह की बिक्री', value: formatRupee(report.weekSales) },
    { label: 'इस महीने की बिक्री', value: formatRupee(report.monthSales) },
    { label: 'कुल ऑर्डर', value: report.totalOrders },
    { label: 'पूरे हुए ऑर्डर', value: report.completedOrders },
    { label: 'रद्द ऑर्डर', value: report.cancelledOrders },
    { label: 'ऑनलाइन भुगतान की कुल राशि', value: formatRupee(report.totalOnlinePayments) },
  ]

  return (
    <div>
      <h1 className="font-extrabold text-xl text-gray-800 mb-5">बिक्री रिपोर्ट</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-xs text-gray-500 font-semibold">{c.label}</p>
            <p className="text-xl font-extrabold text-kisan mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-4">सबसे ज्यादा बिकने वाली सब्ज़ियाँ</h2>
        <div className="flex flex-col gap-3">
          {report.topVegetables.map(([name, qty], idx) => (
            <div key={name} className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-kisan/10 text-kisan font-bold text-xs flex items-center justify-center">{idx + 1}</span>
              <span className="flex-1 text-sm font-semibold text-gray-700">{name}</span>
              <span className="text-sm text-gray-500">{qty.toFixed(1)} इकाई बिकी</span>
            </div>
          ))}
          {report.topVegetables.length === 0 && <p className="text-gray-400 text-sm">अभी तक कोई बिक्री नहीं</p>}
        </div>
      </div>
    </div>
  )
}
