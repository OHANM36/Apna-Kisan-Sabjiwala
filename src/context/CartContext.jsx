import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { safeGet, safeSet } from '../utils/safeStorage'

const CartContext = createContext(null)
const STORAGE_KEY = 'aks_cart_v1'

export const MAX_LINE_QTY = 50

// aks_cart_v1 यूज़र-संपादन योग्य है: लोड पर मात्रा/कीमत को सीमा में रखें (असली सुरक्षा सर्वर पर place_order में है)
export function sanitizeCart(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const l of raw) {
    if (!l || typeof l !== 'object' || !l.id) continue
    const qty = Number(l.quantity)
    const price = Number(l.price)
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) continue
    out.push({ ...l, quantity: Math.min(MAX_LINE_QTY, Math.round(qty * 1000) / 1000), price })
  }
  return out
}

const clampQty = (q) => Math.min(MAX_LINE_QTY, Math.round(q * 1000) / 1000)

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const saved = safeGet(STORAGE_KEY)
      return saved ? sanitizeCart(JSON.parse(saved)) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    safeSet(STORAGE_KEY, JSON.stringify(items)) // storage बंद/भरा हो तो भी ऐप चलता रहे
  }, [items])

  function addToCart(vegetable, qty = 1) {
    // vegetable.id: cart-line की unique id (tiered आइटम के लिए vegetableId से अलग हो सकती है)
    // vegetable.vegetableId: असली सब्ज़ी की id (डेटाबेस में order_items के लिए ज़रूरी)
    const vegetableId = vegetable.vegetableId || vegetable.id
    setItems((prev) => {
      const existing = prev.find((i) => i.id === vegetable.id)
      if (existing) {
        return prev.map((i) =>
          i.id === vegetable.id ? { ...i, quantity: clampQty(i.quantity + qty) } : i
        )
      }
      return [
        ...prev,
        {
          id: vegetable.id,
          vegetableId,
          sellerId: vegetable.sellerId || vegetable.seller_id || null,
          sellerName: vegetable.sellerName || vegetable.sellers?.business_name || null,
          name: vegetable.name,
          emoji: vegetable.emoji,
          image_url: vegetable.image_url,
          price: vegetable.price,
          unit: vegetable.unit,
          quantity: clampQty(qty),
        },
      ]
    })
  }

  function increaseQty(id) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity: clampQty(i.quantity + 1) } : i))
    )
  }

  function decreaseQty(id) {
    setItems((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, quantity: clampQty(i.quantity - 1) } : i))
        .filter((i) => i.quantity > 0)
    )
  }

  function removeFromCart(id) {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  function clearCart() {
    setItems([])
  }

  // प्रकाशित कीमतों से कार्ट मिलाएं. नेटवर्क न हो तो कुछ नहीं बदलता ({ok:false}) — कैश्ड कार्ट चलता रहे।
  const itemsRef = useRef(items)
  itemsRef.current = items
  const syncPrices = useCallback(async () => {
    const current = itemsRef.current
    if (current.length === 0) return { ok: true, changed: [], removed: [] }
    const ids = [...new Set(current.map((i) => i.vegetableId || i.id))]
    const { data, error } = await supabase.from('vegetables').select('id, price, price_tiers, is_active, stock_status').in('id', ids)
    if (error || !data) return { ok: false, changed: [], removed: [] }
    const { syncCartWithCatalog } = await import('../pricing/cartSync') // भारी pricing engine सिर्फ़ ज़रूरत पर
    const res = syncCartWithCatalog(current, data)
    if (res.changed.length || res.removed.length) setItems(res.items)
    return { ok: true, changed: res.changed, removed: res.removed }
  }, [])

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)
  // हर लाइन पहले round2 (paise की गड़बड़ी से बचने के लिए), फिर जोड़ (M7)
  const subtotal = Math.round(items.reduce((sum, i) => sum + Math.round(i.quantity * i.price * 100), 0)) / 100

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        increaseQty,
        decreaseQty,
        removeFromCart,
        clearCart,
        totalItems,
        subtotal,
        syncPrices,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart का उपयोग CartProvider के अंदर करें')
  return ctx
}
