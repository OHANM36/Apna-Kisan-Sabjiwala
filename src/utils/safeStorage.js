// localStorage/sessionStorage private mode या full होने पर throw करते हैं — इन्हें कभी ऐप नहीं रोकना चाहिए (H8)
export function safeGet(key, store = 'local') {
  try {
    return (store === 'session' ? sessionStorage : localStorage).getItem(key)
  } catch {
    return null
  }
}
export function safeSet(key, value, store = 'local') {
  try {
    ;(store === 'session' ? sessionStorage : localStorage).setItem(key, value)
    return true
  } catch {
    return false
  }
}
export function safeRemove(key, store = 'local') {
  try {
    ;(store === 'session' ? sessionStorage : localStorage).removeItem(key)
  } catch {
    /* ignore */
  }
}
export function safeJson(key, fallback, store = 'local') {
  try {
    const raw = safeGet(key, store)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
