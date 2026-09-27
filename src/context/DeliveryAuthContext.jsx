import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const DeliveryAuthContext = createContext(null)
const STORAGE_KEY = 'aks_delivery_boy_id'

export function DeliveryAuthProvider({ children }) {
  const [deliveryBoy, setDeliveryBoy] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedId = localStorage.getItem(STORAGE_KEY)
    if (!savedId) {
      setLoading(false)
      return
    }
    // सुरक्षा: हर बार खुलने पर दोबारा जांचें कि यह डिलीवरी बॉय अभी भी सक्रिय है या नहीं
    supabase
      .from('delivery_boys')
      .select('*')
      .eq('id', savedId)
      .maybeSingle()
      .then(({ data }) => {
        if (data && data.is_active) {
          setDeliveryBoy(data)
        } else {
          localStorage.removeItem(STORAGE_KEY)
        }
        setLoading(false)
      })
  }, [])

  async function loginWithPin(pin) {
    const { data, error } = await supabase
      .from('delivery_boys')
      .select('*')
      .eq('pin', pin)
      .eq('is_active', true)
      .maybeSingle()

    if (error || !data) {
      return { error: 'गलत पिन। कृपया दोबारा कोशिश करें।' }
    }
    setDeliveryBoy(data)
    localStorage.setItem(STORAGE_KEY, data.id)
    return { data }
  }

  function logout() {
    setDeliveryBoy(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <DeliveryAuthContext.Provider
      value={{ deliveryBoy, loading, loginWithPin, logout, isLoggedIn: !!deliveryBoy }}
    >
      {children}
    </DeliveryAuthContext.Provider>
  )
}

export function useDeliveryAuth() {
  const ctx = useContext(DeliveryAuthContext)
  if (!ctx) throw new Error('useDeliveryAuth का उपयोग DeliveryAuthProvider के अंदर करें')
  return ctx
}
