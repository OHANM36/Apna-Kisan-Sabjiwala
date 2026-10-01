import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePT } from '../pricing/strings'
import { loadPricingBundle, publishItems } from '../pricing/api'
import { percentChange } from '../pricing/engine'
import {
  computeProduct,
  productInputFrom,
  buildPublishItem,
  istDate,
  stockAgeDays,
  daysSince,
  packSizesFromTiers,
  purchaseUnitFromStoreUnit,
} from '../pricing/products'
import { Delta, MoneyInput, OwnerOnly, bigBtn, rupee } from '../pricing/ui/common'

const UNIT_SHORT = { kg: 'kg', '500g': '500g', '250g': '250g', '200g': '200g', '100g': '100g', piece: 'pc', bunch: 'bunch' }

/** एक सब्ज़ी की पंक्ति की पूरी गणना — UI और पब्लिश दोनों इसी का इस्तेमाल करते हैं */
function buildRow(veg, bundle, rawInput, lossConfirmed, today) {
  const profile = bundle.profiles.get(veg.id) || null
  const rule = bundle.rules.get(veg.category_id) || null
  const inv = bundle.inventory.get(veg.id)
  const typed = rawInput !== undefined && rawInput !== ''
  if (!profile && !typed) return { veg, profile, skip: true }

  const purchase = typed ? Number(rawInput) : Number(profile.purchase_price)
  if (typed && (!Number.isFinite(purchase) || purchase <= 0)) return { veg, profile, typed, invalidInput: true }

  const restocked = typed
  const stockAge = restocked ? 0 : stockAgeDays(inv?.stock_received_at, today)

  // नई प्रोफ़ाइल: मौजूदा पैक-साइज़ (price_tiers) बचाकर रखें
  const overrides = { purchasePrice: purchase, stockAge, previousPurchasePrice: profile?.purchase_price ?? null, lossConfirmed }
  let droppedTiers = 0
  if (!profile) {
    const pk = packSizesFromTiers(veg.price_tiers)
    droppedTiers = pk.dropped
    if (pk.sellingUnit) {
      overrides.sellingUnit = pk.sellingUnit
      overrides.packSizes = pk.packSizes
      overrides.purchaseUnit = purchaseUnitFromStoreUnit(veg.unit)
    }
  }
  const p = productInputFrom(veg, profile, rule, bundle.settings, overrides)
  const computed = computeProduct(p, bundle.settings)
  const oldSelling = Number(veg.price)
  const newSelling = computed.valid ? computed.cust.price : null
  const purchaseChanged = !profile || (typed && purchase !== Number(profile.purchase_price))
  const sellingChanged = newSelling !== null && newSelling !== oldSelling
  const needsConfirm = computed.valid && computed.cust.requiresConfirmation
  const change = profile ? percentChange(profile.purchase_price, purchase) : null
  const bigChange = change !== null && Math.abs(change) >= bundle.settings.purchaseChangeAlertPercent && change !== 0

  const item = computed.valid
    ? buildPublishItem({
        veg,
        profile,
        p,
        computed,
        stored: { wastage: profile?.wastage_pct ?? null, handling: profile?.handling_cost ?? null, margin: profile?.margin_pct ?? null },
        stockReceivedAt: restocked ? today : null,
      })
    : null

  return {
    veg,
    profile,
    p,
    computed,
    typed,
    purchase,
    oldPurchase: profile ? Number(profile.purchase_price) : null,
    oldSelling,
    newSelling,
    purchaseChanged,
    sellingChanged,
    changed: purchaseChanged || sellingChanged,
    needsConfirm,
    blocked: !computed.valid || needsConfirm,
    change,
    bigChange,
    droppedTiers,
    item,
  }
}

export default function AdminTodaysPrices() {
  return (
    <OwnerOnly>
      <TodaysPrices />
    </OwnerOnly>
  )
}

function TodaysPrices() {
  const pt = usePT()
  const [bundle, setBundle] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [inputs, setInputs] = useState({})
  const [confirm, setConfirm] = useState({}) // { vegId: true } — नुकसान वाली कीमत की पुष्टि
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [outcome, setOutcome] = useState(null)
  const today = istDate()

  const load = useCallback(async () => {
    setLoadError('')
    try {
      setBundle(await loadPricingBundle())
    } catch (e) {
      setLoadError(e.message)
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const rows = useMemo(() => {
    if (!bundle) return []
    return bundle.vegetables.filter((v) => v.is_active).map((v) => buildRow(v, bundle, inputs[v.id], !!confirm[v.id], today))
  }, [bundle, inputs, confirm, today])

  const enteredCount = Object.values(inputs).filter((v) => v !== '' && v !== undefined).length
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = bundle ? bundle.vegetables.filter((v) => v.is_active) : []
    return q ? list.filter((v) => `${v.name} ${v.name_en || ''}`.toLowerCase().includes(q)) : list
  }, [bundle, search])
  const rowById = useMemo(() => new Map(rows.map((r) => [r.veg.id, r])), [rows])

  const previewRows = rows.filter((r) => !r.skip && !r.invalidInput && (r.changed || r.blocked))
  const publishable = previewRows.filter((r) => r.changed && !r.blocked)
  const invalidRows = rows.filter((r) => r.invalidInput)

  function setInput(id, value) {
    setInputs((prev) => ({ ...prev, [id]: value }))
    setOutcome(null)
  }

  async function publish() {
    if (!publishable.length || publishing) return
    setPublishing(true)
    setOutcome(null)
    try {
      const res = await publishItems(publishable.map((r) => r.item), `today-prices ${today}`)
      if (res.status === 'queued') {
        setOutcome({ kind: 'queued' })
        setInputs({})
        setConfirm({})
        setPreview(false)
      } else {
        const names = new Map(bundle.vegetables.map((v) => [v.id, v.name]))
        const conflicts = res.results.filter((r) => r.status === 'conflict').map((r) => names.get(r.vegetable_id) || r.vegetable_id)
        const rejected = res.results.filter((r) => r.status === 'rejected').map((r) => `${names.get(r.vegetable_id) || r.vegetable_id} (${r.reason})`)
        setOutcome({ kind: 'done', applied: res.applied, conflicts, rejected })
        // सफल पंक्तियों के इनपुट साफ़ करें; बाकी रहने दें ताकि दोबारा कोशिश हो सके
        const ok = new Set(res.results.filter((r) => r.status === 'applied').map((r) => r.vegetable_id))
        setInputs((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !ok.has(id))))
        setPreview(false)
        await load()
      }
    } catch (e) {
      setOutcome({ kind: 'error', message: e.message })
    }
    setPublishing(false)
  }

  if (loadError)
    return (
      <div className="p-4">
        <p className="text-red-600 font-semibold mb-3">{loadError}</p>
        <button onClick={load} className="bg-kisan-green text-white rounded-xl px-4 py-2 font-bold">
          {pt('retry')}
        </button>
      </div>
    )
  if (!bundle) return <p className="text-gray-500 p-4">{pt('loading')}</p>

  return (
    <div className="pb-28 max-w-2xl mx-auto">
      <h1 className="text-xl font-extrabold text-gray-800">{pt('tp_title')}</h1>
      <p className="text-xs text-gray-500 mt-1 mb-3">{pt('tp_subtitle')}</p>

      {outcome?.kind === 'done' && (
        <div className="rounded-2xl bg-green-50 border border-green-300 text-green-800 p-3 mb-3 text-sm font-semibold">
          ✅ {pt('tp_published', { n: outcome.applied })}
          {outcome.conflicts.length > 0 && (
            <p className="text-amber-800 mt-1">
              ⚠️ {pt('tp_conflicts')} {outcome.conflicts.join(', ')}
            </p>
          )}
          {outcome.rejected.length > 0 && (
            <p className="text-red-700 mt-1">
              ❌ {pt('tp_rejected')} {outcome.rejected.join(', ')}
            </p>
          )}
        </div>
      )}
      {outcome?.kind === 'queued' && <div className="rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 p-3 mb-3 text-sm font-semibold">⏳ {pt('tp_queued')}</div>}
      {outcome?.kind === 'error' && <div className="rounded-2xl bg-red-50 border border-red-300 text-red-700 p-3 mb-3 text-sm font-semibold">❌ {outcome.message}</div>}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={pt('search')}
        className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base mb-3 bg-white"
      />

      <ul className="space-y-2">
        {visible.map((v) => {
          const profile = bundle.profiles.get(v.id)
          const row = rowById.get(v.id)
          const val = inputs[v.id] ?? ''
          const unit = profile ? UNIT_SHORT[profile.purchase_unit] : UNIT_SHORT[purchaseUnitFromStoreUnit(v.unit)]
          const stale = profile ? daysSince(profile.last_price_updated_at) : null
          const isStale = stale !== null && stale > bundle.settings.staleAfterDays
          return (
            <li key={v.id} className={`rounded-2xl bg-white border-2 p-3 ${row?.invalidInput ? 'border-red-300' : val !== '' ? 'border-kisan-green' : 'border-gray-100'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-extrabold text-gray-800 truncate">
                    {v.emoji} {v.name}
                  </p>
                  {v.name_en && <p className="text-[11px] text-gray-400">{v.name_en}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] text-gray-400">{pt('tp_selling_now')}</p>
                  <p className="font-extrabold text-gray-800">
                    {rupee(v.price)}
                    <span className="text-xs text-gray-400">/{v.unit}</span>
                  </p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1">
                  <MoneyInput
                    value={val}
                    onChange={(x) => setInput(v.id, x)}
                    placeholder={profile ? String(profile.purchase_price) : pt('tp_purchase_price')}
                    suffix={`/${unit}`}
                    invalid={row?.invalidInput}
                    aria-label={`${v.name} ${pt('tp_purchase_price')}`}
                  />
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px]">
                {!profile && <span className="text-amber-700 font-semibold">{pt('tp_no_profile')}</span>}
                {profile && <span className="text-gray-500">{pt('tp_purchase')}: {rupee(profile.purchase_price)}/{unit}</span>}
                {isStale && <span className="text-amber-700 font-semibold">{pt('tp_stale_hint', { d: Number.isFinite(stale) ? stale : '—' })}</span>}
                {profile?.manual_override && <span className="text-blue-700 font-bold">{pt('pp_manual')}</span>}
                {row?.invalidInput && <span className="text-red-600 font-bold">{pt('tp_invalid_row')}</span>}
              </div>
              {row && !row.skip && !row.invalidInput && !row.computed.valid && (
                <p className="mt-1 text-xs text-red-600 font-semibold">{row.computed.errors.map((e) => pt(`err_${e.code}`)).join(' • ')}</p>
              )}
              {row && row.typed && row.computed?.valid && (
                <p className="mt-1 text-sm">
                  {pt('tp_selling')}: <Delta from={row.oldSelling} to={row.newSelling} />
                  {row.bigChange && (
                    <span className={`ml-2 text-xs font-bold ${row.change > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {row.change > 0 ? '+' : ''}
                      {row.change}%
                    </span>
                  )}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-gray-200 p-3 md:pl-64" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="max-w-2xl mx-auto">
          <button onClick={() => setPreview(true)} disabled={!bundle || (enteredCount === 0 && rows.filter((r) => !r.skip && r.changed).length === 0)} className={`${bigBtn} bg-kisan-green text-white`}>
            🧮 {pt('tp_recalculate')}
            {enteredCount > 0 && <span className="ml-2 bg-white/25 rounded-full px-2 py-0.5 text-sm">{enteredCount}</span>}
          </button>
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-end md:items-center md:justify-center">
          <div className="bg-gray-50 w-full md:max-w-xl max-h-[92vh] rounded-t-3xl md:rounded-3xl flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-extrabold text-lg text-gray-800">{pt('tp_preview')}</h2>
              <p className="text-xs text-gray-500">{pt('tp_changed_count', { n: publishable.length })}</p>
            </div>
            <div className="overflow-y-auto p-3 space-y-2 flex-1">
              {invalidRows.length > 0 && (
                <p className="text-sm text-red-600 font-bold">
                  {pt('tp_invalid_row')}: {invalidRows.map((r) => r.veg.name).join(', ')}
                </p>
              )}
              {previewRows.length === 0 && <p className="text-center text-gray-500 py-8">{pt('tp_nothing')}</p>}
              {previewRows.map((r) => (
                <div key={r.veg.id} className={`rounded-2xl bg-white border-2 p-3 ${r.blocked ? 'border-red-300' : 'border-gray-100'}`}>
                  <p className="font-extrabold text-gray-800">
                    {r.veg.emoji} {r.veg.name}
                  </p>
                  <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                    <span className="text-gray-500">{pt('tp_purchase')}</span>
                    <Delta from={r.oldPurchase} to={r.purchase} invert />
                    <span className="text-gray-500">{pt('tp_selling')}</span>
                    {r.computed.valid ? <Delta from={r.oldSelling} to={r.newSelling} /> : <span className="text-red-600 font-bold">—</span>}
                  </div>
                  {r.bigChange && (
                    <p className={`text-xs font-bold mt-1 ${r.change > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {pt(r.change > 0 ? 'al_purchase_up' : 'al_purchase_down', { name: r.veg.name, from: r.oldPurchase, to: r.purchase, percent: r.change })}
                    </p>
                  )}
                  {r.computed.valid && r.computed.calc.warnings.filter((w) => w.code !== 'MANUAL_BELOW_SAFE').map((w, i) => (
                    <p key={i} className="text-xs font-semibold text-amber-700 mt-1">⚠️ {pt(`warn_${w.code}`, w.params)}</p>
                  ))}
                  {r.droppedTiers > 0 && <p className="text-xs text-amber-700 mt-1">⚠️ {r.droppedTiers} पुराने पैक-साइज़ (जैसे 750 ग्राम) नई कीमत-सूची में नहीं रहेंगे / {r.droppedTiers} old pack size(s) not in the standard list will be replaced.</p>}
                  {!r.computed.valid && <p className="text-xs text-red-600 font-semibold mt-1">{r.computed.errors.map((e) => pt(`err_${e.code}`)).join(' • ')}</p>}
                  {r.needsConfirm && (
                    <label className="flex items-start gap-2 mt-2 text-xs font-bold text-red-700 bg-red-50 rounded-xl p-2">
                      <input type="checkbox" className="mt-0.5 w-5 h-5" checked={!!confirm[r.veg.id]} onChange={(e) => setConfirm((c) => ({ ...c, [r.veg.id]: e.target.checked }))} />
                      <span>
                        {pt('warn_MANUAL_BELOW_SAFE', { minimumSafePrice: r.computed.calc.minimumSafePrice })}
                        <br />
                        {pt('tp_confirm_loss')}
                      </span>
                    </label>
                  )}
                  {r.blocked && <p className="text-[11px] text-red-600 font-bold mt-1">🚫 {pt('tp_blocked')}</p>}
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-gray-200 space-y-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              <button onClick={publish} disabled={publishing || publishable.length === 0} className={`${bigBtn} bg-kisan-orange text-white`}>
                {publishing ? pt('tp_publishing') : `📢 ${pt('tp_publish')}`}
              </button>
              <button onClick={() => setPreview(false)} disabled={publishing} className={`${bigBtn} bg-gray-200 text-gray-700`}>
                {pt('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-xs text-gray-400 mt-6">
        <Link to="/admin/product-pricing" className="underline">
          {pt('nav_product_pricing')}
        </Link>
      </p>
    </div>
  )
}
