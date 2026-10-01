import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const SettingsContext = createContext(null)

const DEFAULTS = {
  min_order_value: Number(import.meta.env.VITE_MIN_ORDER_VALUE || 199),
  delivery_fee: Number(import.meta.env.VITE_DELIVERY_FEE || 20),
  free_delivery_above: null,
  business_whatsapp: import.meta.env.VITE_BUSINESS_WHATSAPP || '918839351985',
  business_name: import.meta.env.VITE_BUSINESS_NAME || 'Apna Kisan Sabjiwala',
  is_store_open: true,
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS)
  const [deliveryRules, setDeliveryRules] = useState([])
  const [loading, setLoading] = useState(true)

  async function loadSettings() {
    setLoading(true)
    const { data, error } = await supabase
      .from('delivery_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
    if (!error && data) {
      setSettings({ ...DEFAULTS, ...data })
    }
    // डिलीवरी नियम (वैकल्पिक): टेबल न हो/खाली हो तो ऊपर की delivery_settings से ही पुराना व्यवहार चलता है
    const rules = await supabase.from('delivery_rules').select('*').eq('is_active', true).order('min_subtotal')
    if (!rules.error && Array.isArray(rules.data)) setDeliveryRules(rules.data)
    setLoading(false)
  }

  useEffect(() => {
    loadSettings()
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, deliveryRules, loading, reloadSettings: loadSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings का उपयोग SettingsProvider के अंदर करें')
  return ctx
}
