// एडमिन के लिए Web Push (ऐप/ब्राउज़र बंद होने पर भी नया-ऑर्डर नोटिफ़िकेशन)
import { supabase } from '../supabaseClient'
import { isStandalone } from './pwa'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function isIos() {
  const ua = window.navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)
}

function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function toKey(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

// SW सिर्फ़ production build में रजिस्टर होता है (pwa.js), इसलिए इंतज़ार की सीमा रखते हैं
function getRegistration(timeoutMs) {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('SW_NOT_READY')), timeoutMs)),
  ])
}

// 'no-key' | 'ios-install' | 'unsupported' | 'denied' | 'off' | 'on'
export async function getPushState() {
  if (!VAPID_PUBLIC_KEY) return 'no-key'
  if (isIos() && !isStandalone()) return 'ios-install'
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'
  try {
    const reg = await getRegistration(2500)
    return (await reg.pushManager.getSubscription()) ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

async function saveSubscription(sub) {
  const j = sub.toJSON()
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: j.endpoint,
    p_p256dh: j.keys?.p256dh,
    p_auth: j.keys?.auth,
    p_user_agent: navigator.userAgent,
  })
  return error ? { ok: false, reason: 'save' } : { ok: true }
}

// बटन-क्लिक (user gesture) से ही बुलाएँ
export async function enablePush() {
  try {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return { ok: false, reason: perm === 'denied' ? 'denied' : 'dismissed' }
    const reg = await getRegistration(6000)
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) })
    }
    return await saveSubscription(sub)
  } catch (e) {
    return { ok: false, reason: e?.message === 'SW_NOT_READY' ? 'sw' : 'error' }
  }
}

// लॉगिन के बाद: इस डिवाइस की subscription मौजूदा एडमिन के नाम पर ताज़ा कर दें
export async function syncPush() {
  try {
    const reg = await getRegistration(2500)
    const sub = await reg.pushManager.getSubscription()
    if (sub) await saveSubscription(sub)
  } catch {
    // चुपचाप अनदेखा करें
  }
}

export async function disablePush() {
  try {
    const reg = await getRegistration(2500)
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await supabase.rpc('unregister_push_subscription', { p_endpoint: sub.endpoint })
      await sub.unsubscribe()
    }
    return true
  } catch {
    return false
  }
}
