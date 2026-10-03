import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// ऑर्डर की लाइन में सब्ज़ी का नाम ऑर्डर के समय हिंदी में सेव होता है (order_items.vegetable_name)।
// English मोड में दिखाने के लिए vegetables.name_en एक बार लाकर याद रखते हैं।
// जिसका English नाम एडमिन ने नहीं भरा / जो सब्ज़ी अब उपलब्ध नहीं, उसका हिंदी नाम ही दिखता है (fallback)।
const cache = new Map() // vegetable_id -> name_en | null

export function useOrderItemNames(items, language) {
  const [, bump] = useState(0)
  const missing = [...new Set((items || []).map((i) => i.vegetable_id).filter((id) => id && !cache.has(id)))]
  const key = missing.join(',')

  useEffect(() => {
    if (language !== 'en' || missing.length === 0) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase.from('vegetables').select('id, name_en').in('id', missing)
        const found = new Map((data || []).map((v) => [v.id, (v.name_en || '').trim() || null]))
        for (const id of missing) cache.set(id, found.get(id) ?? null)
        if (!cancelled) bump((n) => n + 1)
      } catch {
        /* नाम न मिले तो हिंदी नाम दिखता रहेगा */
      }
    })()
    return () => { cancelled = true }
  }, [key, language]) // eslint-disable-line react-hooks/exhaustive-deps

  return (item) => (language === 'en' && cache.get(item.vegetable_id)) || item.vegetable_name
}
