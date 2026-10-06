// ऑफर/कूपन की सूचना (ग्राहक): ग्राहक अपनी मर्ज़ी से जुड़ता है। ऑर्डर-स्थिति वाली सूचना (customerPush.js) से अलग,
// क्योंकि वह ऑर्डर से जुड़ी होती है। ब्राउज़र की push subscription वही रहती है, सिर्फ़ यहाँ अलग सूची में दर्ज होती है।
import { supabase } from '../supabaseClient'
import { isStandalone } from './pwa'
import { isIos, pushSupported, toKey, getRegistration } from './push'
import { safeGet, safeSet, safeRemove } from './safeStorage'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
const ON_KEY = 'aks_offer_push_on' // इस डिवाइस ने ऑफर सूचना चुनी है
export const DISMISS_KEY = 'aks_offer_push_dismiss' // "बाद में" दबाया (कुछ दिन न दिखाएँ)
const DISMISS_MS = 7 * 86400000

export function offerCardDismissed() {
  const at = Number(safeGet(DISMISS_KEY) || 0)
  return at > 0 && Date.now() - at < DISMISS_MS
}
export function dismissOfferCard() {
  safeSet(DISMISS_KEY, String(Date.now()))
}

async function saveSubscription(sub) {
  const j = sub.toJSON()
  const { error } = await supabase.rpc('register_offer_push', {
    p_endpoint: j.endpoint,
    p_p256dh: j.keys?.p256dh,
    p_auth: j.keys?.auth,
    p_lang: safeGet('aks_language') === 'en' ? 'en' : 'hi',
    p_user_agent: navigator.userAgent,
  })
  return error ? { ok: false, reason: 'save' } : { ok: true }
}

// 'no-key' | 'ios-install' | 'unsupported' | 'denied' | 'off' | 'on'
export async function getOfferPushState() {
  if (!VAPID_PUBLIC_KEY) return 'no-key'
  if (isIos() && !isStandalone()) return 'ios-install'
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted' || !safeGet(ON_KEY)) return 'off'
  return 'on'
}

// बटन-क्लिक (user gesture) से ही बुलाएँ
export async function enableOfferPush() {
  try {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return { ok: false, reason: perm === 'denied' ? 'denied' : 'dismissed' }
    const reg = await getRegistration(6000)
    let sub = await reg.pushManager.getSubscription()
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) })
    const res = await saveSubscription(sub)
    if (res.ok) safeSet(ON_KEY, '1')
    return res
  } catch (e) {
    return { ok: false, reason: e?.message === 'SW_NOT_READY' ? 'sw' : 'error' }
  }
}

// चालू हो तो ऐप खुलने पर चुपचाप दोबारा दर्ज करें (ब्राउज़र कभी-कभी endpoint बदल देता है)
export async function syncOfferPush() {
  try {
    if (!VAPID_PUBLIC_KEY || !pushSupported()) return
    if (Notification.permission !== 'granted' || !safeGet(ON_KEY)) return
    const reg = await getRegistration(2500)
    const sub = await reg.pushManager.getSubscription()
    if (sub) await saveSubscription(sub)
  } catch {
    /* सूचना "अच्छा-हो" वाली सुविधा है — चुपचाप अनदेखा करें */
  }
}

export async function disableOfferPush() {
  safeRemove(ON_KEY)
  try {
    const reg = await getRegistration(2500)
    const sub = await reg.pushManager.getSubscription()
    if (sub) await supabase.rpc('unregister_offer_push', { p_endpoint: sub.endpoint })
    return true
  } catch {
    return false
  }
}
