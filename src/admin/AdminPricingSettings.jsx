import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useSettings } from '../context/SettingsContext'
import { usePT } from '../pricing/strings'
import { loadPricingBundle } from '../pricing/api'
import { ROUNDING_MODES, resolveSettings } from '../pricing/engine'
import { settingsToRow } from '../pricing/products'
import { validateDeliveryRules } from '../pricing/delivery'
import { Field, NumberInput, OwnerOnly, bigBtn, inputCls } from '../pricing/ui/common'
import { SettingsPageSkeleton } from '../components/Skeleton'

const RULE_PRESETS = {
  regular: { wastage: 4, margin: 15 },
  normal: { wastage: 8, margin: 20 },
  leafy: { wastage: 20, margin: 30 },
  premium: { wastage: 10, margin: 30 },
}
const str = (v) => (v === null || v === undefined ? '' : String(v))
const num = (s) => (s === '' || s === null || s === undefined ? NaN : Number(s))

export default function AdminPricingSettings() {
  return (
    <OwnerOnly>
      <PricingSettings />
    </OwnerOnly>
  )
}

function Card({ title, children }) {
  return (
    <section className="rounded-2xl bg-white border border-gray-100 p-4 space-y-3">
      <h2 className="font-extrabold text-gray-800">{title}</h2>
      {children}
    </section>
  )
}

function PricingSettings() {
  const pt = usePT()
  const { settings: storeSettings, reloadSettings } = useSettings()
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [s, setS] = useState(null) // सभी टेक्स्ट-रूप में
  const [tiers, setTiers] = useState([])
  const [rules, setRules] = useState([])
  const [existingRuleIds, setExistingRuleIds] = useState([])
  const [catRules, setCatRules] = useState({})
  const [categories, setCategories] = useState([])
  const [minOrder, setMinOrder] = useState('')
  const [audit, setAudit] = useState([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [errs, setErrs] = useState({})

  const load = useCallback(async () => {
    setError('')
    try {
      const b = await loadPricingBundle()
      const eng = b.settings
      setS({
        roundingMode: eng.roundingMode,
        smallUnitRoundingMode: eng.smallUnitRoundingMode,
        minSafetyMarginPercent: str(eng.minSafetyMarginPercent),
        maxWastagePercent: str(eng.maxWastagePercent),
        maxMarginPercent: str(eng.maxMarginPercent),
        defaultWastagePercent: str(eng.defaultWastagePercent),
        defaultHandlingCost: str(eng.defaultHandlingCost),
        defaultMarginPercent: str(eng.defaultMarginPercent),
        freshnessEnabled: eng.freshnessEnabled,
        demandEnabled: eng.demandEnabled,
        demandLowPercent: str(eng.demandLowPercent),
        demandHighPercent: str(eng.demandHighPercent),
        demandMaxIncreasePercent: str(eng.demandMaxIncreasePercent),
        demandMaxDecreasePercent: str(eng.demandMaxDecreasePercent),
        staleAfterDays: str(eng.staleAfterDays),
        purchaseChangeAlertPercent: str(eng.purchaseChangeAlertPercent),
        lowMarginPercent: str(eng.lowMarginPercent),
        highWastagePercent: str(eng.highWastagePercent),
        deliveryCostPerOrder: str(eng.deliveryCostPerOrder),
        paymentChargePercent: str(eng.paymentChargePercent),
      })
      setTiers(eng.freshnessTiers.map((t) => ({ minDays: str(t.minDays), percent: str(t.percent) })))
      setCategories(b.categories)
      setCatRules(
        Object.fromEntries(
          b.categories.map((c) => {
            const r = b.rules.get(c.id)
            return [c.id, { type: r?.rule_type || 'normal', wastage: str(r?.wastage_pct), margin: str(r?.margin_pct), handling: str(r?.handling_cost ?? '') }]
          })
        )
      )
      setExistingRuleIds([...b.rules.keys()])

      const [dr, ds, au] = await Promise.all([
        supabase.from('delivery_rules').select('*').order('min_subtotal'),
        supabase.from('delivery_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('pricing_audit_log').select('at, actor_name, table_name, action, row_key').order('at', { ascending: false }).limit(12),
      ])
      if (dr.error) throw new Error(dr.error.message)
      setRules((dr.data || []).map((r) => ({ id: r.id, label: r.label || '', min_subtotal: str(r.min_subtotal), fee: str(r.fee), is_active: r.is_active })))
      setMinOrder(str(ds.data?.min_order_value ?? storeSettings.min_order_value))
      setAudit(au.data || [])
      setLoaded(true)
    } catch (e) {
      setError(e.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const set = (k, v) => setS((p) => ({ ...p, [k]: v }))

  function validate() {
    const e = {}
    const inRange = (k, lo, hi, msgKey = 'tp_invalid_row') => {
      const n = num(s[k])
      if (!Number.isFinite(n) || n < lo || n > hi) e[k] = pt(msgKey)
    }
    inRange('minSafetyMarginPercent', 0, 500)
    inRange('maxWastagePercent', 0, 99)
    inRange('maxMarginPercent', 0, 1000)
    inRange('defaultWastagePercent', 0, 99)
    inRange('defaultHandlingCost', 0, 100000)
    inRange('defaultMarginPercent', 0, 1000)
    inRange('demandLowPercent', -90, 0)
    inRange('demandHighPercent', 0, 100)
    inRange('demandMaxIncreasePercent', 0, 100)
    inRange('demandMaxDecreasePercent', 0, 90)
    inRange('staleAfterDays', 1, 365)
    inRange('purchaseChangeAlertPercent', 0, 1000)
    inRange('lowMarginPercent', 0, 1000)
    inRange('highWastagePercent', 0, 99)
    inRange('deliveryCostPerOrder', 0, 100000)
    inRange('paymentChargePercent', 0, 20)
    if (num(s.defaultWastagePercent) > num(s.maxWastagePercent)) e.defaultWastagePercent = pt('err_WASTAGE_ABOVE_LIMIT')
    const mo = num(minOrder)
    if (!Number.isFinite(mo) || mo < 0) e.minOrder = pt('tp_invalid_row')
    tiers.forEach((t, i) => {
      const d = num(t.minDays)
      const p = num(t.percent)
      if (!Number.isFinite(d) || d < 0 || !Number.isInteger(d)) e[`tier_d_${i}`] = pt('tp_invalid_row')
      if (!Number.isFinite(p) || p < 0 || p > 90) e[`tier_p_${i}`] = pt('tp_invalid_row')
    })
    validateDeliveryRules(rules).forEach((x) => {
      e[x.row >= 0 ? `rule_${x.row}` : 'rules'] = pt('tp_invalid_row')
    })
    Object.entries(catRules).forEach(([id, r]) => {
      if (r.wastage === '' && r.margin === '') return
      const w = num(r.wastage)
      const m = num(r.margin)
      const h = r.handling === '' ? 0 : num(r.handling)
      if (!Number.isFinite(w) || w < 0 || w >= 100 || !Number.isFinite(m) || m < 0 || !Number.isFinite(h) || h < 0) e[`cat_${id}`] = pt('tp_invalid_row')
    })
    return e
  }

  async function save() {
    setMsg(null)
    const e = validate()
    setErrs(e)
    if (Object.keys(e).length) return setMsg({ ok: false, text: pt('ps_fix_errors') })
    setSaving(true)
    try {
      // 1) प्राइसिंग सेटिंग
      const eng = resolveSettings({
        ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === 'string' ? (ROUNDING_MODES.includes(v) ? v : Number(v)) : v])),
        freshnessTiers: tiers.map((t) => ({ minDays: Number(t.minDays), percent: Number(t.percent) })),
      })
      const { error: e1 } = await supabase.from('pricing_settings').update(settingsToRow(eng)).eq('id', 1)
      if (e1) throw new Error(e1.message)

      // 2) डिलीवरी नियम (हटाए गए → delete; बाकी → update/insert)
      const keepIds = rules.filter((r) => r.id).map((r) => r.id)
      const { data: current } = await supabase.from('delivery_rules').select('id')
      const toDelete = (current || []).map((r) => r.id).filter((id) => !keepIds.includes(id))
      if (toDelete.length) {
        const { error } = await supabase.from('delivery_rules').delete().in('id', toDelete)
        if (error) throw new Error(error.message)
      }
      for (const r of rules) {
        const row = { label: r.label || null, min_subtotal: Number(r.min_subtotal), fee: Number(r.fee), is_active: r.is_active }
        const { error } = r.id ? await supabase.from('delivery_rules').update(row).eq('id', r.id) : await supabase.from('delivery_rules').insert(row)
        if (error) throw new Error(error.message)
      }

      // 3) पुरानी delivery_settings को नियमों और न्यूनतम ऑर्डर के साथ सिंक रखें (होम बैनर/फ़ॉलबैक के लिए)
      const active = rules.filter((r) => r.is_active)
      const base = active.find((r) => Number(r.min_subtotal) === 0)
      const freeRule = active.filter((r) => Number(r.fee) === 0 && Number(r.min_subtotal) > 0).sort((a, b) => Number(a.min_subtotal) - Number(b.min_subtotal))[0]
      const { error: e3 } = await supabase
        .from('delivery_settings')
        .update({
          min_order_value: Number(minOrder),
          delivery_fee: base ? Number(base.fee) : storeSettings.delivery_fee,
          free_delivery_above: freeRule ? Number(freeRule.min_subtotal) : null,
        })
        .eq('id', 1)
      if (e3) throw new Error(e3.message)

      // 4) श्रेणी नियम
      for (const c of categories) {
        const r = catRules[c.id]
        if (!r || (r.wastage === '' && r.margin === '')) continue
        const { error } = await supabase.from('pricing_rules').upsert({ category_id: c.id, rule_type: r.type, wastage_pct: Number(r.wastage), margin_pct: Number(r.margin), handling_cost: r.handling === '' ? 0 : Number(r.handling) })
        if (error) throw new Error(error.message)
      }
      await reloadSettings()
      await load()
      setMsg({ ok: true, text: pt('ps_saved') })
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    }
    setSaving(false)
  }

  if (error)
    return (
      <div className="p-4">
        <p className="text-red-600 font-semibold mb-3">{error}</p>
        <button onClick={load} className="bg-kisan-green text-white rounded-xl px-4 py-2 font-bold">
          {pt('retry')}
        </button>
      </div>
    )
  if (!loaded || !s) return <SettingsPageSkeleton rows={4} />

  // कंपोनेंट नहीं, सीधा JSX लौटाने वाला हेल्पर — वरना हर कीस्ट्रोक पर इनपुट दोबारा बनकर फ़ोकस खो देता
  const N = ({ k, label, hint }) => (
    <Field key={k} label={label} hint={hint} error={errs[k]}>
      <NumberInput value={s[k]} onChange={(v) => set(k, v)} invalid={!!errs[k]} />
    </Field>
  )

  return (
    <div className="max-w-2xl mx-auto pb-28 space-y-4">
      <h1 className="text-xl font-extrabold text-gray-800">{pt('ps_title')}</h1>

      <Card title={`🛒 ${pt('ps_min_order')}`}>
        <Field label={pt('ps_min_order')} error={errs.minOrder}>
          <NumberInput value={minOrder} onChange={setMinOrder} invalid={!!errs.minOrder} />
        </Field>
      </Card>

      <Card title={`🛵 ${pt('ps_delivery_rules')}`}>
        <p className="text-xs text-gray-500">{pt('ps_delivery_hint')}</p>
        {errs.rules && <p className="text-xs text-red-600 font-bold">{pt('tp_invalid_row')}: min = 0 ✔</p>}
        {rules.map((r, i) => (
          <div key={r.id || `new-${i}`} className="flex items-end gap-2">
            <div className="flex-1">
              <Field label={pt('ps_rule_from')} error={errs[`rule_${i}`]}>
                <NumberInput value={r.min_subtotal} onChange={(v) => setRules((p) => p.map((x, j) => (j === i ? { ...x, min_subtotal: v } : x)))} invalid={!!errs[`rule_${i}`]} />
              </Field>
            </div>
            <div className="flex-1">
              <Field label={pt('ps_rule_fee')}>
                <NumberInput value={r.fee} onChange={(v) => setRules((p) => p.map((x, j) => (j === i ? { ...x, fee: v } : x)))} invalid={!!errs[`rule_${i}`]} />
              </Field>
            </div>
            <button onClick={() => setRules((p) => p.filter((_, j) => j !== i))} className="pb-3 text-red-500 text-sm font-bold">
              {pt('ps_remove')}
            </button>
          </div>
        ))}
        <button onClick={() => setRules((p) => [...p, { label: '', min_subtotal: '', fee: '', is_active: true }])} className="text-sm font-bold text-kisan-green">
          {pt('ps_add_rule')}
        </button>
      </Card>

      <Card title={`🔢 ${pt('ps_rounding')}`}>
        <Field label={pt('ps_rounding_main')}>
          <select value={s.roundingMode} onChange={(e) => set('roundingMode', e.target.value)} className={inputCls}>
            {ROUNDING_MODES.map((m) => (
              <option key={m} value={m}>
                {pt(`rm_${m}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={pt('ps_rounding_small')}>
          <select value={s.smallUnitRoundingMode} onChange={(e) => set('smallUnitRoundingMode', e.target.value)} className={inputCls}>
            {ROUNDING_MODES.map((m) => (
              <option key={m} value={m}>
                {pt(`rm_${m}`)}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      <Card title={`🛡️ ${pt('ps_protection')}`}>
        {N({ k: 'minSafetyMarginPercent', label: pt('ps_min_safety') })}
      </Card>

      <Card title={`📏 ${pt('ps_limits')} & ${pt('ps_defaults')}`}>
        <div className="grid grid-cols-2 gap-3">
          {N({ k: 'maxWastagePercent', label: pt('ps_max_wastage') })}
          {N({ k: 'maxMarginPercent', label: pt('ps_max_margin') })}
          {N({ k: 'defaultWastagePercent', label: pt('pp_wastage') })}
          {N({ k: 'defaultMarginPercent', label: pt('pp_margin') })}
          {N({ k: 'defaultHandlingCost', label: pt('pp_handling') })}
        </div>
      </Card>

      <Card title={`🌿 ${pt('ps_freshness')}`}>
        <label className="flex items-center gap-2 font-bold text-sm">
          <input type="checkbox" className="w-5 h-5" checked={s.freshnessEnabled} onChange={(e) => set('freshnessEnabled', e.target.checked)} />
          {pt('ps_freshness_on')}
        </label>
        {tiers.map((t, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1">
              <Field label={pt('ps_tier_days')} error={errs[`tier_d_${i}`]}>
                <NumberInput value={t.minDays} onChange={(v) => setTiers((p) => p.map((x, j) => (j === i ? { ...x, minDays: v } : x)))} invalid={!!errs[`tier_d_${i}`]} />
              </Field>
            </div>
            <div className="flex-1">
              <Field label={pt('ps_tier_pct')} error={errs[`tier_p_${i}`]}>
                <NumberInput value={t.percent} onChange={(v) => setTiers((p) => p.map((x, j) => (j === i ? { ...x, percent: v } : x)))} invalid={!!errs[`tier_p_${i}`]} />
              </Field>
            </div>
            {tiers.length > 1 && (
              <button onClick={() => setTiers((p) => p.filter((_, j) => j !== i))} className="pb-3 text-red-500 text-sm font-bold">
                {pt('ps_remove')}
              </button>
            )}
          </div>
        ))}
        <button onClick={() => setTiers((p) => [...p, { minDays: '', percent: '' }])} className="text-sm font-bold text-kisan-green">
          {pt('ps_add_tier')}
        </button>
      </Card>

      <Card title={`📈 ${pt('ps_demand')}`}>
        <label className="flex items-center gap-2 font-bold text-sm">
          <input type="checkbox" className="w-5 h-5" checked={s.demandEnabled} onChange={(e) => set('demandEnabled', e.target.checked)} />
          {pt('ps_demand_on')}
        </label>
        <div className="grid grid-cols-2 gap-3">
          {N({ k: 'demandLowPercent', label: pt('ps_demand_low'), hint: "−90 … 0" })}
          {N({ k: 'demandHighPercent', label: pt('ps_demand_high'), hint: "0 … 100" })}
          {N({ k: 'demandMaxDecreasePercent', label: pt('ps_demand_max_down') })}
          {N({ k: 'demandMaxIncreasePercent', label: pt('ps_demand_max_up') })}
        </div>
      </Card>

      <Card title={`🔔 ${pt('ps_alerts')}`}>
        <div className="grid grid-cols-2 gap-3">
          {N({ k: 'purchaseChangeAlertPercent', label: pt('ps_alert_change') })}
          {N({ k: 'lowMarginPercent', label: pt('ps_alert_low_margin') })}
          {N({ k: 'highWastagePercent', label: pt('ps_alert_wastage') })}
          {N({ k: 'staleAfterDays', label: pt('ps_alert_stale') })}
        </div>
      </Card>

      <Card title={`💼 ${pt('ps_costs')}`}>
        <div className="grid grid-cols-2 gap-3">
          {N({ k: 'deliveryCostPerOrder', label: pt('ps_delivery_cost') })}
          {N({ k: 'paymentChargePercent', label: pt('ps_payment_pct') })}
        </div>
        <p className="text-[11px] text-gray-400">{pt('ps_costs_note')}</p>
      </Card>

      <Card title={`📂 ${pt('ps_category_rules')}`}>
        {categories.map((c) => {
          const r = catRules[c.id] || { type: 'normal', wastage: '', margin: '', handling: '' }
          const upd = (patch) => setCatRules((p) => ({ ...p, [c.id]: { ...r, ...patch } }))
          return (
            <div key={c.id} className={`rounded-xl border p-3 ${errs[`cat_${c.id}`] ? 'border-red-300' : 'border-gray-100'}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="font-bold text-gray-800">{c.name}</p>
                <select
                  value={r.type}
                  onChange={(e) => upd({ type: e.target.value })}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                >
                  {Object.keys(RULE_PRESETS).map((t) => (
                    <option key={t} value={t}>
                      {pt(`ps_rule_type_${t}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label={pt('ps_rule_wastage')}>
                  <NumberInput value={r.wastage} onChange={(v) => upd({ wastage: v })} />
                </Field>
                <Field label={pt('ps_rule_margin')}>
                  <NumberInput value={r.margin} onChange={(v) => upd({ margin: v })} />
                </Field>
                <Field label={pt('ps_rule_handling')}>
                  <NumberInput value={r.handling} onChange={(v) => upd({ handling: v })} />
                </Field>
              </div>
              <button onClick={() => upd({ wastage: String(RULE_PRESETS[r.type].wastage), margin: String(RULE_PRESETS[r.type].margin) })} className="mt-2 text-xs font-bold text-kisan-green">
                {pt('ps_apply_preset')}
              </button>
            </div>
          )
        })}
      </Card>

      {audit.length > 0 && (
        <Card title={`🧾 ${pt('ps_audit')}`}>
          <ul className="text-xs text-gray-600 space-y-1">
            {audit.map((a, i) => (
              <li key={i}>
                {new Date(a.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })} — {a.actor_name || '—'} • {a.table_name} • {a.action}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-gray-200 p-3 md:pl-64" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="max-w-2xl mx-auto">
          {msg && <p className={`text-sm font-bold mb-2 ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
          <button onClick={save} disabled={saving} className={`${bigBtn} bg-kisan-green text-white`}>
            {saving ? pt('saving') : `💾 ${pt('save')}`}
          </button>
        </div>
      </div>
    </div>
  )
}
