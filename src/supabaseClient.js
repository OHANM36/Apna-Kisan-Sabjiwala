import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '⚠️ Supabase की जानकारी नहीं मिली। कृपया .env फाइल में VITE_SUPABASE_URL और VITE_SUPABASE_ANON_KEY डालें (देखें .env.example)।'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
