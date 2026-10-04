import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { formatRupee, ORDER_STAGES, stageOf } from '../utils/format'
import { AdminDashboardSkeleton } from '../components/Skeleton'
import { useLanguage } from '../context/LanguageContext'
import { AdminPageHeader, AdminStatCard, AdminStatusBadge, AdminEmptyState } from './AdminUI'

const TXT = {
  title: { hi: 'डैशबोर्ड', en: 'Dashboard' },
  today: { hi: 'आज का कारोबार', en: "Today's business overview" },
  todaySales: { hi: 'आज की बिक्री', en: "Today's sales" },
  totalOrders: { hi: 'कुल ऑर्डर', en: 'Total orders' },
  completed: { hi: 'पूरे हुए ऑर्डर', en: 'Completed' },
  cancelled: { hi: 'रद्द ऑर्डर', en: 'Cancelled' },
  totalPaid: { hi: 'कुल भुगतान प्राप्त', en: 'Total paid' },
  status: { hi: 'ऑर्डर की स्थिति', en: 'Order status' },
  recent: { hi: 'हाल के ऑर्डर', en: 'Recent orders' },
  viewAll: { hi: 'सभी देखें', en: 'View all' },
  none: { hi: 'अभी तक कोई ऑर्डर नहीं', en: 'No orders yet' },
}

export default function AdminDashboard() {
  const { language } = useLanguage()
  const lang = language === 'en' ? 'en' : 'hi'
  const t = (k) => TXT[k][lang]

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

    const stageCounts = Object.fromEntries(ORDER_STAGES.map((st) => [st.key, all.filter((o) => stageOf(o).key === st.key).length]))
    setStats({ todaySales, totalOrders, completed, cancelled, totalPaid, stageCounts })
    setRecentOrders(recent || [])
    setLoading(false)
  }

  if (loading) return <AdminDashboardSkeleton />

  const locale = lang === 'en' ? 'en-IN' : 'hi-IN'
  const todayText = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
  const fmtTime = (d) =>
    new Date(d).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div>
      <AdminPageHeader title={t('title')} subtitle={`${t('today')} • ${todayText}`} />

      <div className="admin-stat-grid">
        <AdminStatCard featured icon="rupee" tone="green" label={t('todaySales')} value={formatRupee(stats.todaySales)} />
        <AdminStatCard icon="orders" tone="blue" label={t('totalOrders')} value={stats.totalOrders} />
        <AdminStatCard icon="check" tone="green" label={t('completed')} value={stats.completed} />
        <AdminStatCard icon="close" tone="red" label={t('cancelled')} value={stats.cancelled} />
        <AdminStatCard icon="card" tone="amber" label={t('totalPaid')} value={formatRupee(stats.totalPaid)} />
      </div>

      <div className="admin-section-head"><h3>{t('status')}</h3></div>
      <div className="admin-chip-row">
        {ORDER_STAGES.map((st) => (
          <Link key={st.key} to={`/admin/orders?stage=${st.key}`} className={`admin-chip ${st.tone}`}>
            {st.label} <b>{stats.stageCounts[st.key]}</b>
          </Link>
        ))}
      </div>

      <div className="admin-section-head">
        <h3>{t('recent')}</h3>
        <Link to="/admin/orders" className="admin-link">{t('viewAll')}</Link>
      </div>
      {recentOrders.length === 0 ? (
        <div className="admin-card"><AdminEmptyState icon="orders" text={t('none')} /></div>
      ) : (
        <div className="admin-list">
          {recentOrders.map((o) => {
            const st = stageOf(o)
            return (
              <Link key={o.id} to={`/admin/orders?stage=${st.key}`} className="admin-list-item">
                <div className="admin-li-row">
                  <span className="admin-li-title">{o.order_number}</span>
                  <span className="admin-li-amount">{formatRupee(o.total_amount)}</span>
                </div>
                <div className="admin-li-row">
                  <span className="admin-li-sub">{o.customer_name}{o.customer_phone ? ` • ${o.customer_phone}` : ''}</span>
                  <AdminStatusBadge label={o.order_status} tone={st.tone} />
                </div>
                <div className="admin-li-row">
                  <span className="admin-li-sub">{fmtTime(o.created_at)}</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
