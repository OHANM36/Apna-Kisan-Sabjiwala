import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { usePT } from '../pricing/strings'
import { loadPricingBundle } from '../pricing/api'
import { computeAlerts, reviewCount } from '../pricing/alerts'
import { round2 } from '../pricing/engine'
import { istDate, resolveParams, daysSince } from '../pricing/products'
import { OwnerOnly, rupee } from '../pricing/ui/common'
import { DashboardSkeleton } from '../components/Skeleton'

export default function AdminPricingDashboard() {
  return (
    <OwnerOnly>
      <Dashboard />
    </OwnerOnly>
  )
}

function Stat({ label, value, tone = 'text-gray-800', sub }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 p-3">
      <p className="text-[11px] font-bold text-gray-500 leading-tight">{label}</p>
      <p className={`text-xl font-extrabold mt-1 ${tone}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Dashboard() {
  const pt = usePT()
  const [bundle, setBundle] = useState(null)
  const [fin, setFin] = useState(null)
  const [error, setError] = useState('')
  const today = istDate()

  const load = useCallback(async () => {
    setError('')
    try {
      const b = await loadPricingBundle()
      const since = `${today}T00:00:00+05:30`
      const { data: orders, error: oe } = await supabase
        .from('orders')
        .select('id, total_amount')
        .gte('created_at', since)
        .eq('payment_status', 'सफल')
        .neq('order_status', 'रद्द')
      if (oe) throw new Error(oe.message)
      let rows = []
      if (orders?.length) {
        const { data, error: fe } = await supabase.from('order_financials').select('*').in('order_id', orders.map((o) => o.id))
        if (fe) throw new Error(fe.message)
        rows = data || []
      }
      const sum = (k) => round2(rows.reduce((a, r) => a + Number(r[k] || 0), 0))
      const revenue = sum('revenue')
      const productCost = round2(sum('product_purchase_cost') + sum('wastage_cost') + sum('packing_cost'))
      setFin({
        orders: orders?.length || 0,
        revenue,
        productCost,
        itemsRevenue: sum('items_revenue'),
        deliveryCost: sum('delivery_cost'),
        contribution: sum('contribution'),
        unknown: rows.reduce((a, r) => a + Number(r.unknown_cost_items || 0), 0),
        missing: (orders?.length || 0) - rows.length,
      })
      setBundle(b)
    } catch (e) {
      setError(e.message)
    }
  }, [today])
  useEffect(() => {
    load()
  }, [load])

  const view = useMemo(() => {
    if (!bundle) return null
    const active = bundle.vegetables.filter((v) => v.is_active)
    const items = active.map((veg) => ({ veg, profile: bundle.profiles.get(veg.id) || null, rule: bundle.rules.get(veg.category_id) || null }))
    const alerts = computeAlerts(items, bundle.settings)
    const profiled = items.filter((i) => i.profile)
    const updatedToday = profiled.filter((i) => daysSince(i.profile.last_price_updated_at) === 0).length
    const manual = profiled.filter((i) => i.profile.manual_override).length
    const need = new Set(alerts.filter((a) => a.type === 'stale' || a.type === 'no_profile').map((a) => a.vegetable_id)).size
    const low = new Set(alerts.filter((a) => a.type === 'margin_low' || a.type === 'below_safe').map((a) => a.vegetable_id)).size
    const wast = profiled.filter((i) => resolveParams(i.profile, i.rule, bundle.settings).wastage >= bundle.settings.highWastagePercent).length
    const closeMargin = new Set(alerts.filter((a) => a.type === 'margin_low').map((a) => a.vegetable_id)).size
    return { alerts, updatedToday, manual, need, low, wast, review: reviewCount(alerts), closeMargin }
  }, [bundle])

  if (error)
    return (
      <div className="p-4">
        <p className="text-red-600 font-semibold mb-3">{error}</p>
        <button onClick={load} className="bg-kisan-green text-white rounded-xl px-4 py-2 font-bold">
          {pt('retry')}
        </button>
      </div>
    )
  if (!bundle || !fin || !view) return <DashboardSkeleton stages={false} />

  const grossMargin = round2(fin.itemsRevenue - fin.productCost)
  const avgMargin = fin.revenue > 0 ? round2((fin.contribution / fin.revenue) * 100) : null
  const tone = (n) => (n < 0 ? 'text-red-600' : 'text-green-700')

  return (
    <div className="max-w-2xl mx-auto pb-10 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-gray-800">{pt('dash_title')}</h1>
        <button onClick={load} className="text-sm font-bold text-kisan-green">
          ↻
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {view.review > 0 && (
          <Link to="/admin/product-pricing" className="col-span-2 rounded-2xl bg-amber-50 border border-amber-300 p-3 font-extrabold text-amber-900 text-sm">
            ⚠️ {pt('dash_review_card', { n: view.review })}
          </Link>
        )}
        {view.closeMargin > 0 && (
          <Link to="/admin/product-pricing" className="col-span-2 rounded-2xl bg-orange-50 border border-orange-300 p-3 font-extrabold text-orange-900 text-sm">
            📉 {pt('dash_close_margin_card', { n: view.closeMargin })}
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label={pt('dash_sales')} value={rupee(fin.revenue)} sub={pt('dash_orders_counted', { n: fin.orders })} />
        <Stat label={pt('dash_product_cost')} value={rupee(fin.productCost)} />
        <Stat label={pt('dash_gross_margin')} value={rupee(grossMargin)} tone={tone(grossMargin)} />
        <Stat label={pt('dash_delivery_cost')} value={rupee(fin.deliveryCost)} />
        <Stat label={pt('dash_contribution')} value={rupee(fin.contribution)} tone={tone(fin.contribution)} />
        <Stat label={pt('dash_avg_margin')} value={avgMargin === null ? '—' : `${avgMargin}%`} tone={tone(fin.contribution)} />
      </div>
      {(fin.unknown > 0 || fin.missing > 0) && <p className="text-xs text-amber-700 font-semibold">⚠️ {pt('dash_unknown_cost', { n: fin.unknown + fin.missing })}</p>}

      <div className="grid grid-cols-2 gap-2">
        <Stat label={pt('dash_updated_today')} value={view.updatedToday} />
        <Stat label={pt('dash_need_update')} value={view.need} tone={view.need ? 'text-amber-700' : 'text-gray-800'} />
        <Stat label={pt('dash_low_margin')} value={view.low} tone={view.low ? 'text-red-600' : 'text-gray-800'} />
        <Stat label={pt('dash_high_wastage')} value={view.wast} />
        <Stat label={pt('dash_manual')} value={view.manual} />
      </div>

      <section className="rounded-2xl bg-white border border-gray-100 p-4">
        <h2 className="font-extrabold text-gray-800 mb-2">🔔 {pt('dash_alerts')}</h2>
        {view.alerts.length === 0 && <p className="text-sm text-gray-500">{pt('dash_no_alerts')}</p>}
        <ul className="space-y-2">
          {view.alerts.slice(0, 30).map((a, i) => (
            <li key={i} className={`text-sm rounded-xl px-3 py-2 font-semibold ${a.severity === 'high' ? 'bg-red-50 text-red-800' : a.severity === 'medium' ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-600'}`}>
              {pt(`al_${a.type}`, { name: a.name, ...a.params, days: a.params.days ?? '∞' })}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex gap-2">
        <Link to="/admin/todays-prices" className="flex-1 text-center rounded-2xl bg-kisan-green text-white py-3.5 font-extrabold">
          {pt('nav_todays_prices')}
        </Link>
        <Link to="/admin/product-pricing" className="flex-1 text-center rounded-2xl bg-white border-2 border-kisan-green text-kisan-green py-3.5 font-extrabold">
          {pt('nav_product_pricing')}
        </Link>
      </div>
    </div>
  )
}
