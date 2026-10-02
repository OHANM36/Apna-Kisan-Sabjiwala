import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { usePT } from '../pricing/strings'
import { loadPricingBundle, publishItems } from '../pricing/api'
import { UNIT_CODES, WEIGHT_UNITS, markupPercent, DEMAND_LEVELS } from '../pricing/engine'
import {
  computeProduct,
  productInputFrom,
  buildPublishItem,
  resolveParams,
  istDate,
  stockAgeDays,
  daysSince,
  packSizesFromTiers,
  purchaseUnitFromStoreUnit,
} from '../pricing/products'
import { computeAlerts } from '../pricing/alerts'
import PriceBreakdown from '../pricing/ui/PriceBreakdown'
import { Field, MoneyInput, NumberInput, OwnerOnly, bigBtn, inputCls, rupee } from '../pricing/ui/common'
import { ListPageSkeleton, ListCardsSkeleton, SkeletonWrap } from '../components/Skeleton'

const PACKS = ['500g', '250g', '200g', '100g']
const numOrNull = (s) => (s === '' || s === null || s === undefined ? null : Number(s))

export default function AdminProductPricing() {
  return (
    <OwnerOnly>
      <ProductPricing />
    </OwnerOnly>
  )
}

function ProductPricing() {
  const pt = usePT()
  const [bundle, setBundle] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [flash, setFlash] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setBundle(await loadPricingBundle())
    } catch (e) {
      setError(e.message)
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const alertsById = useMemo(() => {
    if (!bundle) return new Map()
    const items = bundle.vegetables.filter((v) => v.is_active).map((veg) => ({ veg, profile: bundle.profiles.get(veg.id) || null, rule: bundle.rules.get(veg.category_id) || null }))
    const map = new Map()
    for (const a of computeAlerts(items, bundle.settings)) {
      if (!map.has(a.vegetable_id)) map.set(a.vegetable_id, [])
      map.get(a.vegetable_id).push(a)
    }
    return map
  }, [bundle])

  const list = useMemo(() => {
    if (!bundle) return []
    const q = search.trim().toLowerCase()
    return bundle.vegetables.filter((v) => {
      if (q && !`${v.name} ${v.name_en || ''}`.toLowerCase().includes(q)) return false
      const prof = bundle.profiles.get(v.id)
      const al = alertsById.get(v.id) || []
      if (filter === 'manual') return prof?.manual_override
      if (filter === 'review') return al.some((a) => ['purchase_up', 'purchase_down', 'below_safe', 'margin_low'].includes(a.type))
      if (filter === 'low') return al.some((a) => a.type === 'margin_low' || a.type === 'below_safe')
      if (filter === 'stale') return al.some((a) => a.type === 'stale' || a.type === 'no_profile')
      return true
    })
  }, [bundle, search, filter, alertsById])

  if (error)
    return (
      <div className="p-4">
        <p className="text-red-600 font-semibold mb-3">{error}</p>
        <button onClick={load} className="bg-kisan-green text-white rounded-xl px-4 py-2 font-bold">
          {pt('retry')}
        </button>
      </div>
    )
  if (!bundle) return <ListPageSkeleton withButton count={5} />

  const filters = [
    ['all', 'pp_filter_all'],
    ['review', 'pp_filter_review'],
    ['low', 'pp_filter_low'],
    ['manual', 'pp_filter_manual'],
    ['stale', 'pp_filter_stale'],
  ]

  return (
    <div className="max-w-2xl mx-auto pb-10">
      <h1 className="text-xl font-extrabold text-gray-800 mb-3">{pt('pp_title')}</h1>
      {flash && <p className="rounded-xl bg-green-50 border border-green-300 text-green-800 p-2 text-sm font-bold mb-3">{flash}</p>}
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={pt('search')} className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base mb-2 bg-white" />
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
        {filters.map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${filter === k ? 'bg-kisan-green text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {pt(label)}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {list.map((v) => {
          const prof = bundle.profiles.get(v.id)
          const al = alertsById.get(v.id) || []
          const mk = prof ? markupPercent(Number(prof.published_price), Number(prof.base_cost)) : null
          return (
            <li key={v.id}>
              <button onClick={() => setEditing(v)} className="w-full text-left rounded-2xl bg-white border border-gray-100 p-3 active:bg-gray-50">
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-extrabold text-gray-800 truncate">
                      {v.emoji} {v.name}
                      {!v.is_active && <span className="ml-2 text-[10px] text-gray-400">(बंद)</span>}
                    </p>
                    {v.name_en && <p className="text-[11px] text-gray-400">{v.name_en}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-extrabold text-kisan-green">
                      {rupee(v.price)}
                      <span className="text-xs text-gray-400">/{v.unit}</span>
                    </p>
                    {prof && <p className="text-[11px] text-gray-500">{pt('tp_purchase')} {rupee(prof.purchase_price)}/{prof.purchase_unit}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {!prof && <span className="text-[11px] font-bold rounded-full bg-gray-100 text-gray-500 px-2 py-0.5">{pt('pp_not_set')}</span>}
                  {prof && <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${prof.manual_override ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{prof.manual_override ? pt('pp_manual') : pt('pp_auto')}</span>}
                  {mk !== null && <span className="text-[11px] font-bold rounded-full bg-gray-100 text-gray-600 px-2 py-0.5">{pt('pp_margin_now')} {mk}%</span>}
                  {al.filter((a) => a.type !== 'no_profile').slice(0, 3).map((a) => (
                    <span key={a.type} className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${a.severity === 'high' ? 'bg-red-100 text-red-700' : a.severity === 'medium' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}>
                      {pt(`chip_${a.type}`, a.params)}
                    </span>
                  ))}
                </div>
              </button>
            </li>
          )
        })}
        {list.length === 0 && <p className="text-center text-gray-400 py-8">—</p>}
      </ul>

      {editing && (
        <Editor
          key={editing.id}
          veg={editing}
          bundle={bundle}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => {
            setEditing(null)
            setFlash(msg)
            await load()
            setTimeout(() => setFlash(''), 4000)
          }}
        />
      )}
    </div>
  )
}

function Editor({ veg, bundle, onClose, onSaved }) {
  const pt = usePT()
  const profile = bundle.profiles.get(veg.id) || null
  const rule = bundle.rules.get(veg.category_id) || null
  const inv = bundle.inventory.get(veg.id)
  const today = istDate()
  const initialPacks = profile ? { sellingUnit: profile.selling_unit, packSizes: profile.pack_sizes || [] } : packSizesFromTiers(veg.price_tiers)
  const defaults = resolveParams(null, rule, bundle.settings)

  const [f, setF] = useState(() => ({
    name: veg.name || '',
    nameEn: veg.name_en || '',
    categoryId: veg.category_id || '',
    purchasePrice: profile ? String(profile.purchase_price) : '',
    purchaseUnit: profile?.purchase_unit || purchaseUnitFromStoreUnit(veg.unit),
    sellingUnit: initialPacks.sellingUnit || profile?.selling_unit || purchaseUnitFromStoreUnit(veg.unit),
    packSizes: initialPacks.packSizes || [],
    wastage: profile?.wastage_pct != null ? String(profile.wastage_pct) : '',
    handling: profile?.handling_cost != null ? String(profile.handling_cost) : '',
    margin: profile?.margin_pct != null ? String(profile.margin_pct) : '',
    demand: profile?.demand_level || 'normal',
    clearance: !!profile?.allow_clearance,
    manual: !!profile?.manual_override,
    manualPrice: profile?.manual_price != null ? String(profile.manual_price) : '',
    stockQty: inv ? String(inv.quantity) : '',
    received: inv?.stock_received_at || today,
    lossConfirmed: false,
  }))
  const [tab, setTab] = useState('edit')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const stockAge = stockAgeDays(f.received, today)
  const p = useMemo(
    () =>
      productInputFrom(veg, profile, rule, bundle.settings, {
        purchasePrice: f.purchasePrice === '' ? undefined : Number(f.purchasePrice),
        purchaseUnit: f.purchaseUnit,
        sellingUnit: f.sellingUnit,
        packSizes: f.packSizes.filter((x) => x !== f.sellingUnit),
        wastage: f.wastage === '' ? defaults.wastage : Number(f.wastage),
        handling: f.handling === '' ? defaults.handling : Number(f.handling),
        margin: f.margin === '' ? defaults.margin : Number(f.margin),
        demandLevel: f.demand,
        allowClearance: f.clearance,
        manualOverride: f.manual,
        manualPrice: f.manual ? numOrNull(f.manualPrice) : null,
        lossConfirmed: f.lossConfirmed,
        stockAge,
        previousPurchasePrice: profile?.purchase_price ?? null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f, stockAge]
  )
  const hasPurchase = f.purchasePrice !== '' && Number(f.purchasePrice) > 0
  const computed = useMemo(() => (hasPurchase ? computeProduct(p, bundle.settings) : null), [p, hasPurchase, bundle.settings])
  const cust = computed?.cust
  const needsConfirm = !!cust?.requiresConfirmation
  const minSafe = computed?.calc?.valid ? computed.calc.minimumSafePrice : null

  const weightBased = WEIGHT_UNITS.includes(f.purchaseUnit)
  const sellingOptions = weightBased ? WEIGHT_UNITS : [f.purchaseUnit]

  function changePurchaseUnit(u) {
    setF((prev) => ({
      ...prev,
      purchaseUnit: u,
      sellingUnit: WEIGHT_UNITS.includes(u) ? (WEIGHT_UNITS.includes(prev.sellingUnit) ? prev.sellingUnit : 'kg') : u,
      packSizes: WEIGHT_UNITS.includes(u) ? prev.packSizes : [],
    }))
  }
  function togglePack(code) {
    setF((prev) => ({ ...prev, packSizes: prev.packSizes.includes(code) ? prev.packSizes.filter((x) => x !== code) : [...prev.packSizes, code] }))
  }

  async function save() {
    setMsg('')
    if (!hasPurchase) return setMsg(pt('pp_purchase_needed'))
    if (!computed?.valid) return setMsg((computed?.calc?.errors || computed?.cust?.errors || []).map((e) => pt(`err_${e.code}`)).join(' • ') || pt('tp_invalid_row'))
    if (needsConfirm) return setMsg(pt('pp_loss_warning'))
    setBusy(true)
    try {
      // 1) नाम/श्रेणी — सीधे vegetables (कीमत का इनसे लेना-देना नहीं)
      const vegUpdate = {}
      if (f.name.trim() && f.name.trim() !== veg.name) vegUpdate.name = f.name.trim()
      if ((f.nameEn || '') !== (veg.name_en || '')) vegUpdate.name_en = f.nameEn.trim() || null
      if ((f.categoryId || null) !== (veg.category_id || null)) vegUpdate.category_id = f.categoryId || null
      if (Object.keys(vegUpdate).length) {
        const { error } = await supabase.from('vegetables').update(vegUpdate).eq('id', veg.id)
        if (error) throw new Error(error.message)
      }
      // 2) स्टॉक मात्रा / तारीख
      const qty = f.stockQty === '' ? null : Number(f.stockQty)
      if (qty !== null && (!Number.isFinite(qty) || qty < 0)) throw new Error(pt('err_QUANTITY_NEGATIVE'))
      const stockChanged = qty !== null && (!inv || Number(inv.quantity) !== qty || inv.stock_received_at !== f.received)
      if (stockChanged) {
        const { error } = await supabase.from('inventory').upsert({ vegetable_id: veg.id, quantity: qty, unit: f.purchaseUnit, stock_received_at: f.received })
        if (error) throw new Error(error.message)
      }
      // 3) कीमत — सिर्फ़ publish_prices() से (इतिहास + ऑडिट + conflict-जांच सहित)
      const purchaseTouched = !profile || Number(f.purchasePrice) !== Number(profile.purchase_price)
      const item = buildPublishItem({
        veg,
        profile,
        p,
        computed,
        stored: { wastage: numOrNull(f.wastage), handling: numOrNull(f.handling), margin: numOrNull(f.margin) },
        stockReceivedAt: purchaseTouched ? today : null,
      })
      const res = await publishItems([item], 'product-pricing edit')
      if (res.status === 'queued') return onSaved('⏳ Pending Sync')
      const r = res.results[0]
      if (r.status === 'conflict') throw new Error(pt('pp_changed_elsewhere'))
      if (r.status === 'rejected') throw new Error(`${pt('tp_rejected')} ${r.reason}`)
      onSaved(pt('pp_saved'))
    } catch (e) {
      setMsg(e.message)
    }
    setBusy(false)
  }

  const lastBy = profile?.price_updated_by_name || '—'
  const lastWhen = profile?.last_price_updated_at ? new Date(profile.last_price_updated_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
  const stale = profile ? daysSince(profile.last_price_updated_at) : null

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-end md:items-center md:justify-center">
      <div className="bg-gray-50 w-full md:max-w-xl max-h-[94vh] rounded-t-3xl md:rounded-3xl flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-extrabold text-lg text-gray-800">
              {veg.emoji} {veg.name}
            </h2>
            {profile && <p className="text-[11px] text-gray-500">{pt('pp_last_updated', { when: lastWhen, who: lastBy })}{stale > bundle.settings.staleAfterDays ? ` • ${pt('tp_stale_hint', { d: stale })}` : ''}</p>}
          </div>
          <button onClick={onClose} className="text-2xl text-gray-400 px-2" aria-label={pt('close')}>
            ✕
          </button>
        </div>
        <div className="flex border-b border-gray-200 bg-white">
          {['edit', 'history'].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 py-3 text-sm font-bold ${tab === t ? 'text-kisan-green border-b-4 border-kisan-green' : 'text-gray-500'}`}>
              {t === 'edit' ? pt('pp_edit') : pt('pp_history')}
            </button>
          ))}
        </div>

        {tab === 'history' ? (
          <History vegId={veg.id} />
        ) : (
          <>
            <div className="overflow-y-auto p-4 space-y-4 flex-1">
              {/* AUTO / MANUAL टॉगल */}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => set('manual', false)} className={`rounded-xl py-3 font-extrabold ${!f.manual ? 'bg-kisan-green text-white' : 'bg-white border-2 border-gray-200 text-gray-500'}`}>
                  🤖 {pt('pp_auto_price')}
                </button>
                <button onClick={() => set('manual', true)} className={`rounded-xl py-3 font-extrabold ${f.manual ? 'bg-blue-600 text-white' : 'bg-white border-2 border-gray-200 text-gray-500'}`}>
                  ✍️ {pt('pp_manual_price')}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={pt('tp_purchase_price')} error={f.purchasePrice !== '' && !(Number(f.purchasePrice) > 0) ? pt('err_PURCHASE_PRICE_ZERO') : ''}>
                  <MoneyInput value={f.purchasePrice} onChange={(x) => set('purchasePrice', x)} placeholder="0" invalid={f.purchasePrice !== '' && !(Number(f.purchasePrice) > 0)} />
                </Field>
                <Field label={pt('pp_purchase_unit')}>
                  <select value={f.purchaseUnit} onChange={(e) => changePurchaseUnit(e.target.value)} className={inputCls}>
                    {UNIT_CODES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {f.manual && (
                <Field label={pt('pp_manual_input')}>
                  <MoneyInput value={f.manualPrice} onChange={(x) => set('manualPrice', x)} placeholder="0" invalid={f.manualPrice !== '' && !(Number(f.manualPrice) > 0)} />
                </Field>
              )}
              {f.manual && needsConfirm && (
                <div className="rounded-xl bg-red-50 border border-red-300 p-3 text-sm">
                  <p className="font-extrabold text-red-700">⚠️ {pt('pp_loss_warning')}</p>
                  <p className="text-red-700 text-xs mt-0.5">{pt('pp_min_safe')}: {rupee(minSafe)}</p>
                  <label className="flex items-center gap-2 mt-2 font-bold text-red-700">
                    <input type="checkbox" className="w-5 h-5" checked={f.lossConfirmed} onChange={(e) => set('lossConfirmed', e.target.checked)} />
                    {pt('pp_loss_confirm')}
                  </label>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label={pt('pp_selling_unit')}>
                  <select value={f.sellingUnit} onChange={(e) => set('sellingUnit', e.target.value)} className={inputCls} disabled={!weightBased}>
                    {sellingOptions.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={pt('pp_stock')}>
                  <NumberInput value={f.stockQty} onChange={(x) => set('stockQty', x)} placeholder="0" />
                </Field>
              </div>

              {weightBased && (
                <div>
                  <p className="text-xs font-bold text-gray-600 mb-1">{pt('pp_pack_sizes')}</p>
                  <div className="flex flex-wrap gap-2">
                    {PACKS.filter((c) => c !== f.sellingUnit).map((c) => (
                      <button key={c} onClick={() => togglePack(c)} className={`rounded-full px-4 py-2 text-sm font-bold ${f.packSizes.includes(c) ? 'bg-kisan-green text-white' : 'bg-white border-2 border-gray-200 text-gray-600'}`}>
                        {c}
                      </button>
                    ))}
                    {f.sellingUnit !== 'kg' && (
                      <button onClick={() => togglePack('kg')} className={`rounded-full px-4 py-2 text-sm font-bold ${f.packSizes.includes('kg') ? 'bg-kisan-green text-white' : 'bg-white border-2 border-gray-200 text-gray-600'}`}>
                        kg
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <Field label={pt('pp_wastage')} hint={pt('pp_inherit', { v: `${defaults.wastage}%` })} error={f.wastage !== '' && Number(f.wastage) >= 100 ? pt('err_WASTAGE_TOO_HIGH') : ''}>
                  <NumberInput value={f.wastage} onChange={(x) => set('wastage', x)} placeholder={String(defaults.wastage)} invalid={f.wastage !== '' && Number(f.wastage) >= 100} />
                </Field>
                <Field label={pt('pp_handling')} hint={pt('pp_inherit', { v: `₹${defaults.handling}` })}>
                  <NumberInput value={f.handling} onChange={(x) => set('handling', x)} placeholder={String(defaults.handling)} />
                </Field>
                <Field label={pt('pp_margin')} hint={pt('pp_inherit', { v: `${defaults.margin}%` })}>
                  <NumberInput value={f.margin} onChange={(x) => set('margin', x)} placeholder={String(defaults.margin)} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={pt('pp_stock_received')} hint={pt('pp_stock_age', { d: stockAge })}>
                  <input type="date" value={f.received} max={today} onChange={(e) => set('received', e.target.value || today)} className={inputCls} />
                </Field>
                <Field label={pt('pp_demand')} hint={bundle.settings.demandEnabled ? '' : pt('pp_demand_off')}>
                  <select value={f.demand} onChange={(e) => set('demand', e.target.value)} className={inputCls} disabled={!bundle.settings.demandEnabled}>
                    {DEMAND_LEVELS.map((d) => (
                      <option key={d} value={d}>
                        {pt(`pp_demand_${d}`)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <label className="flex items-start gap-2 text-xs font-semibold text-gray-600">
                <input type="checkbox" className="w-5 h-5 mt-0.5" checked={f.clearance} onChange={(e) => set('clearance', e.target.checked)} />
                {pt('pp_allow_clearance')}
              </label>

              <div className="grid grid-cols-2 gap-3">
                <Field label={pt('pp_category')}>
                  <select value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)} className={inputCls}>
                    <option value="">—</option>
                    {bundle.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={pt('pp_name')}>
                  <input value={f.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
                </Field>
              </div>
              <Field label={pt('pp_name_en')}>
                <input value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} className={inputCls} />
              </Field>

              {computed && !computed.valid && (
                <p className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold p-3">
                  {[...(computed.calc.errors || []), ...(computed.calc.valid ? computed.cust.errors : [])].map((e) => pt(`err_${e.code}`)).join(' • ')}
                </p>
              )}

              {computed?.valid && (
                <>
                  <div className="rounded-2xl bg-white border-2 border-kisan-green p-4">
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>{pt('pp_min_safe')}</span>
                      <b className="text-gray-800">{rupee(computed.calc.minimumSafePrice)}</b>
                    </div>
                    <div className="flex justify-between text-sm text-gray-500 mt-1">
                      <span>{pt('pp_recommended')}</span>
                      <b className="text-gray-800">{rupee(computed.calc.recommendedPrice)}</b>
                    </div>
                    <div className="flex justify-between items-end mt-2">
                      <span className="font-bold text-gray-700">{pt('pp_customer_price')}</span>
                      <span className="text-3xl font-extrabold text-kisan-green">
                        {rupee(cust.price)}
                        <span className="text-sm text-gray-400">/{computed.calc.baseUnit}</span>
                      </span>
                    </div>
                    {computed.tiers && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {computed.tiers.map((t, i) => (
                          <span key={i} className="text-xs font-bold bg-green-50 text-green-800 rounded-full px-3 py-1">
                            {t.unit === 'किलो' ? `${t.qty} kg` : `${t.qty} g`} = {rupee(t.price)}
                          </span>
                        ))}
                      </div>
                    )}
                    {computed.calc.minimumProtectionApplied && <p className="mt-2 text-xs font-bold text-amber-700">⚠️ {pt('pp_min_protection')}</p>}
                    {computed.calc.clearanceApplied && <p className="mt-2 text-xs font-bold text-red-700">⚠️ {pt('pp_clearance_warning')}</p>}
                  </div>
                  <PriceBreakdown calc={computed.calc} unitLabel={computed.calc.baseUnit} />
                </>
              )}
            </div>
            <div className="p-3 border-t border-gray-200 space-y-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              {msg && <p className="text-sm text-red-600 font-bold">{msg}</p>}
              <button onClick={save} disabled={busy || !hasPurchase || (needsConfirm && f.manual && !f.lossConfirmed)} className={`${bigBtn} bg-kisan-green text-white`}>
                {busy ? pt('saving') : `💾 ${pt('save')} & ${pt('tp_publish')}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function History({ vegId }) {
  const pt = usePT()
  const [days, setDays] = useState(7)
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    setRows(null)
    const since = new Date(Date.now() - days * 86400000).toISOString()
    supabase
      .from('price_history')
      .select('*')
      .eq('vegetable_id', vegId)
      .gte('changed_at', since)
      .order('changed_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (!alive) return
        if (error) setErr(error.message)
        else setRows(data || [])
      })
    return () => {
      alive = false
    }
  }, [vegId, days])

  return (
    <div className="overflow-y-auto p-4 flex-1">
      <div className="flex gap-2 mb-3">
        {[7, 30, 90].map((d) => (
          <button key={d} onClick={() => setDays(d)} className={`flex-1 rounded-xl py-2.5 text-sm font-extrabold ${days === d ? 'bg-kisan-green text-white' : 'bg-white border-2 border-gray-200 text-gray-600'}`}>
            {pt('pp_days', { n: d })}
          </button>
        ))}
      </div>
      {err && <p className="text-red-600 text-sm font-semibold">{err}</p>}
      {!rows && !err && <SkeletonWrap><ListCardsSkeleton count={3} /></SkeletonWrap>}
      {rows && rows.length === 0 && <p className="text-gray-400 text-center py-6">{pt('pp_no_history')}</p>}
      <ul className="space-y-2">
        {(rows || []).map((h) => (
          <li key={h.id} className="rounded-xl bg-white border border-gray-100 p-3 text-sm">
            <div className="flex justify-between">
              <span className="font-bold text-gray-700">{new Date(h.changed_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${h.source === 'manual' ? 'bg-blue-100 text-blue-700' : h.source === 'external' ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'}`}>{h.source}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 mt-1 text-gray-600 text-xs">
              <span>{pt('tp_purchase')}: {h.previous_purchase_price != null ? `${rupee(h.previous_purchase_price)} → ` : ''}<b>{h.purchase_price != null ? rupee(h.purchase_price) : '—'}</b></span>
              <span>{pt('tp_selling')}: {h.previous_published_price != null ? `${rupee(h.previous_published_price)} → ` : ''}<b>{rupee(h.published_price)}</b></span>
              {h.calculated_price != null && <span>{pt('pp_recommended')}: {rupee(h.calculated_price)}</span>}
              {h.wastage_pct != null && <span>{pt('pp_wastage')}: {h.wastage_pct}% • {pt('pp_margin')}: {h.margin_pct}%</span>}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">{h.changed_by_name || '—'}{h.loss_confirmed ? ' • ⚠️ loss confirmed' : ''}{h.min_protection_applied ? ' • min-protection' : ''}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
