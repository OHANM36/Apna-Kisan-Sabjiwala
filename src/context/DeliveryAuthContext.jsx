import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { safeGet, safeSet, safeRemove } from '../utils/safeStorage'
import { friendlyError } from '../utils/errors'

const DeliveryAuthContext = createContext(null)
const STORAGE_KEY = 'aks_delivery_session_v2' // सर्वर का random session token (PIN या id नहीं)

export function DeliveryAuthProvider({ children }) {
  const [deliveryBoy, setDeliveryBoy] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    safeRemove('aks_delivery_boy_id') // पुराना असुरक्षित कुंजी-नाम (सिर्फ़ id, बिना सत्यापन)
    const saved = safeGet(STORAGE_KEY)
    if (!saved) {
      setLoading(false)
      return
    }
    // हर बार खुलने पर सर्वर से जाँच: token वैध है और डिलीवरी बॉय अब भी सक्रिय है
    supabase.rpc('delivery_me', { p_token: saved }).then(({ data }) => {
      if (data) {
        setDeliveryBoy(data)
        setToken(saved)
      } else {
        safeRemove(STORAGE_KEY)
      }
      setLoading(false)
    })
  }, [])

  async function loginWithPin(pin) {
    const { data, error } = await supabase.rpc('delivery_login', { p_pin: pin })
    if (error) return { error: friendlyError(error) }
    if (!data?.ok) {
      return {
        error: data?.error === 'RATE_LIMITED'
          ? 'बहुत ज़्यादा गलत कोशिशें। कुछ मिनट बाद दोबारा कोशिश करें।'
          : 'गलत पिन। कृपया दोबारा कोशिश करें।',
      }
    }
    setDeliveryBoy(data.boy)
    setToken(data.token)
    safeSet(STORAGE_KEY, data.token)
    return { data: data.boy }
  }

  function logout() {
    if (token) supabase.rpc('delivery_logout', { p_token: token })
    setDeliveryBoy(null)
    setToken(null)
    safeRemove(STORAGE_KEY)
  }

  return (
    <DeliveryAuthContext.Provider value={{ deliveryBoy, token, loading, loginWithPin, logout, isLoggedIn: !!deliveryBoy }}>
      {children}
    </DeliveryAuthContext.Provider>
  )
}

export function useDeliveryAuth() {
  const ctx = useContext(DeliveryAuthContext)
  if (!ctx) throw new Error('useDeliveryAuth का उपयोग DeliveryAuthProvider के अंदर करें')
  return ctx
}
