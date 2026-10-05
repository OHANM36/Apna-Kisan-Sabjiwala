// ग्राहक के लिए Web Push: ऑर्डर की स्थिति बदलते ही फ़ोन पर सूचना (ऐप बंद हो तब भी)।
// एडमिन वाले push.js के सहायक दोबारा इस्तेमाल होते हैं। ग्राहक लॉग-इन नहीं करता, इसलिए
// subscription हर ऑर्डर के access_token से जुड़ती है (register_customer_push RPC)।
import { supabase } from '../supabaseClient'
import { isStandalone } from './pwa'
import { isIos, pushSupported, toKey, getRegistration } from './push'
import { getMyOrders } from './myOrders'
import { safeGet, safeSet, safeRemove } from './safeStorage'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
const OPTOUT_KEY = 'aks_customer_push_off' // ग्राहक ने खुद बंद किया हो तो चुपचाप दोबारा चालू न करें
const MAX_AGE_MS = 3 * 86400000

function activeOrders() {
  return getMyOrders()
    .filter((o) => Date.now() - (o.at || 0) < MAX_AGE_MS)
    .slice(0, 10)
    .map((o) => ({ id: o.id, token: o.token }))
}

async function saveSubscription(sub) {
  const orders = activeOrders()
  if (orders.length === 0) return { ok: true, count: 0 }
  const j = sub.toJSON()
  const { data, error } = await supabase.rpc('register_customer_push', {
    p_orders: orders,
    p_endpoint: j.endpoint,
    p_p256dh: j.keys?.p256dh,
    p_auth: j.keys?.auth,
    p_lang: safeGet('aks_language') === 'en' ? 'en' : 'hi',
    p_user_agent: navigator.userAgent,
  })
  return error ? { ok: false, reason: 'save' } : { ok: true, count: data || 0 }
}

// 'no-key' | 'ios-install' | 'unsupported' | 'denied' | 'off' | 'on'
export async function getCustomerPushState() {
  if (!VAPID_PUBLIC_KEY) return 'no-key'
  if (isIos() && !isStandalone()) return 'ios-install'
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted' || safeGet(OPTOUT_KEY)) return 'off'
  try {
    const reg = await getRegistration(2500)
    return (await reg.pushManager.getSubscription()) ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

// बटन-क्लिक (user gesture) से ही बुलाएँ
export async function enableCustomerPush() {
  try {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return { ok: false, reason: perm === 'denied' ? 'denied' : 'dismissed' }
    const reg = await getRegistration(6000)
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) })
    }
    safeRemove(OPTOUT_KEY)
    return await saveSubscription(sub)
  } catch (e) {
    return { ok: false, reason: e?.message === 'SW_NOT_READY' ? 'sw' : 'error' }
  }
}

// ग्राहक पहले "चालू" कर चुका हो तो नए ऑर्डर/ऐप खुलने पर इस डिवाइस के सारे चालू ऑर्डर जोड़ दें (बिना कुछ पूछे)।
// अनुमति नहीं मिली हो या ग्राहक ने बंद किया हो तो कुछ नहीं करता।
export async function syncCustomerPush() {
  try {
    if (!VAPID_PUBLIC_KEY || !pushSupported()) return
    if (Notification.permission !== 'granted' || safeGet(OPTOUT_KEY)) return
    if (activeOrders().length === 0) return
    const reg = await getRegistration(2500)
    let sub = await reg.pushManager.getSubscription()
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) })
    await saveSubscription(sub)
  } catch {
    // चुपचाप अनदेखा करें — सूचना "अच्छा-हो" वाली सुविधा है, ऑर्डर कभी नहीं रुकता
  }
}

// सिर्फ़ ग्राहक-ऑर्डर की जुड़ावें हटाता है; ब्राउज़र की subscription जस की तस रहती है
// (वही subscription एडमिन push के लिए भी हो सकती है, उसे यहाँ unsubscribe नहीं करते)
export async function disableCustomerPush() {
  safeSet(OPTOUT_KEY, '1')
  try {
    const reg = await getRegistration(2500)
    const sub = await reg.pushManager.getSubscription()
    if (sub) await supabase.rpc('unregister_customer_push', { p_endpoint: sub.endpoint })
    return true
  } catch {
    return false
  }
}
