// supabase/functions/_shared/http.ts
// सभी Edge Functions के साझा सहायक: CORS (allow-list), JSON जवाब, IP, rate-limit, HMAC।
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// ALLOWED_ORIGINS = "https://aapka-domain.com,https://www.aapka-domain.com" (Edge secret).
// खाली हो तो '*' (सिर्फ़ टेस्टिंग के लिए) — प्रोडक्शन में ज़रूर सेट करें।
const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  let allow = '*'
  if (ALLOWED.length) allow = ALLOWED.includes(origin) ? origin : ALLOWED[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders(req) }) : null
}

export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') ?? ''
  return xff.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown'
}

export function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

// security_attempts टेबल (security_hardening.sql) में गिनती रखकर IP-आधारित rate-limit।
// true = अनुमति है; false = सीमा पार।
export async function rateLimit(
  admin: ReturnType<typeof serviceClient>,
  kind: string,
  subject: string,
  max: number,
  windowMinutes: number,
): Promise<boolean> {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString()
  const { count, error } = await admin
    .from('security_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('kind', kind)
    .eq('subject', subject)
    .gte('at', since)
  if (error) {
    console.error('rateLimit count failed', error.message)
    return true // लॉगिंग टेबल में दिक्कत से असली ग्राहक न रुकें (fail-open) — error लॉग में दिखेगा
  }
  if ((count ?? 0) >= max) return false
  await admin.from('security_attempts').insert({ kind, subject })
  if (Math.random() < 0.02) {
    await admin.from('security_attempts').delete().eq('kind', kind).lt('at', new Date(Date.now() - 86_400_000).toISOString())
  }
  return true
}

export async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
