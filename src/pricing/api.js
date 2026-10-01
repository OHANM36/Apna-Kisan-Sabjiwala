// डेटा-परत: Supabase से प्राइसिंग डेटा लोड/सेव, publish_prices() RPC, और खराब नेटवर्क में "Pending Sync" कतार।
import { supabase } from '../supabaseClient'
import { settingsFromRow } from './products'

export const PENDING_KEY = 'aks_pending_prices_v1'

/** मालिक के पूरे प्राइसिंग पेज का डेटा एक बार में */
export async function loadPricingBundle() {
  const [veg, prof, rules, cats, st, inv] = await Promise.all([
    supabase.from('vegetables').select('*').is('seller_id', null).order('display_order').order('name'),
    supabase.from('product_pricing').select('*'),
    supabase.from('pricing_rules').select('*'),
    supabase.from('categories').select('*').order('display_order'),
    supabase.from('pricing_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('inventory').select('*'),
  ])
  const firstError = [veg, prof, rules, cats, st, inv].find((r) => r.error)?.error
  if (firstError) throw new Error(firstError.message)
  return {
    vegetables: veg.data || [],
    profiles: new Map((prof.data || []).map((p) => [p.vegetable_id, p])),
    rules: new Map((rules.data || []).map((r) => [r.category_id, r])),
    categories: cats.data || [],
    settingsRow: st.data,
    settings: settingsFromRow(st.data),
    inventory: new Map((inv.data || []).map((i) => [i.vegetable_id, i])),
  }
}

export function isNetworkError(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = String(error?.message || error || '')
  return /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(msg)
}

/**
 * कीमतें पब्लिश करें. नतीजा:
 *  { status: 'done', applied, results }     — सर्वर ने प्रोसेस किया
 *  { status: 'queued' }                      — नेटवर्क नहीं; "Pending Sync" में सहेजा
 * सर्वर की नई कीमत चुपचाप कभी ओवरराइट नहीं होती (base_version का conflict लौटता है).
 */
export async function publishItems(items, note = null) {
  try {
    const { data, error } = await supabase.rpc('publish_prices', { p_items: items, p_note: note })
    if (error) {
      if (isNetworkError(error)) {
        queuePending(items, note)
        return { status: 'queued' }
      }
      throw new Error(error.message)
    }
    return { status: 'done', applied: data.applied, results: data.results || [], batchId: data.batch_id }
  } catch (e) {
    if (isNetworkError(e)) {
      queuePending(items, note)
      return { status: 'queued' }
    }
    throw e
  }
}

// ---------- Pending Sync (localStorage; निजी-मोड में भी बिना क्रैश) ----------
function readStore(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
function writeStore(key, value) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
    if (key === PENDING_KEY && typeof window !== 'undefined') window.dispatchEvent(new Event('aks-pending-changed'))
    return true
  } catch {
    return false
  }
}

export function getPending() {
  const p = readStore(PENDING_KEY)
  return p && Array.isArray(p.items) && p.items.length ? p : null
}

/** कतार में जोड़ें — एक ही सब्ज़ी का नया बदलाव पुराने को बदलता है (base_version पुराना ही रखा जाता है) */
export function queuePending(items, note) {
  const cur = getPending()
  const byId = new Map((cur?.items || []).map((i) => [i.vegetable_id, i]))
  for (const it of items) {
    const prev = byId.get(it.vegetable_id)
    byId.set(it.vegetable_id, prev ? { ...it, base_version: prev.base_version } : it)
  }
  return writeStore(PENDING_KEY, { items: [...byId.values()], note: note ?? cur?.note ?? null, savedAt: new Date().toISOString() })
}

export function clearPending() {
  writeStore(PENDING_KEY, null)
}

/** कतार भेजें. सफल/कॉन्फ़्लिक्ट हुए आइटम कतार से हटते हैं; सिर्फ़ नेटवर्क-फेल होने पर बचे रहते हैं */
export async function syncPending() {
  const pending = getPending()
  if (!pending) return { status: 'empty' }
  try {
    const { data, error } = await supabase.rpc('publish_prices', { p_items: pending.items, p_note: pending.note })
    if (error) {
      if (isNetworkError(error)) return { status: 'offline' }
      throw new Error(error.message)
    }
    clearPending()
    const results = data.results || []
    return {
      status: 'done',
      applied: data.applied,
      conflicts: results.filter((r) => r.status === 'conflict'),
      rejected: results.filter((r) => r.status === 'rejected'),
      results,
    }
  } catch (e) {
    if (isNetworkError(e)) return { status: 'offline' }
    throw e
  }
}
