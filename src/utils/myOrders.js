// इस डिवाइस से दिए गए ऑर्डर और उनके गोपनीय access_token (C1): token सिर्फ़ ऑर्डर बनाने वाले के पास रहता है।
import { safeJson, safeSet } from './safeStorage'

const KEY = 'aks_my_orders_v1'
const MAX = 20

export function getMyOrders() {
  const list = safeJson(KEY, [])
  return Array.isArray(list) ? list.filter((o) => o && o.id && o.token) : []
}

export function saveMyOrder({ id, token, orderNumber }) {
  const rest = getMyOrders().filter((o) => o.id !== id)
  safeSet(KEY, JSON.stringify([{ id, token, orderNumber, at: Date.now() }, ...rest].slice(0, MAX)))
}

export function getOrderToken(id) {
  return getMyOrders().find((o) => o.id === id)?.token || null
}
