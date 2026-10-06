// supabase/functions/send-offer-push/index.ts
//
// मालिक (owner) के बटन दबाने पर ऑफर की Web Push सूचना सभी "ऑफर सूचना" चालू करने वाले ग्राहकों को भेजता है।
// एडमिन पैनल (कूपन / ऑफर पेज) से supabase.functions.invoke('send-offer-push', ...) द्वारा बुलाया जाता है।
//
// सुरक्षा: कॉल करने वाले का login JWT जाँचा जाता है और is_owner() true होना ज़रूरी है।
// (इसलिए डिप्लॉय में --no-verify-jwt न लगाएँ।) secrets वही हैं जो send-order-push में हैं (VAPID_*):
//   supabase functions deploy send-offer-push
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { json, preflight, rateLimit, serviceClient, UUID_RE } from '../_shared/http.ts'

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const configured = !!(VAPID_PUBLIC && VAPID_PRIVATE && SUPABASE_URL && ANON_KEY)
if (configured) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

const MAX_SENDS_PER_HOUR = 5 // गलती से बार-बार दबाने पर ग्राहकों को स्पैम न जाए
const BATCH = 100

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405)
  if (!configured) return json(req, { error: 'सूचना सेवा अभी सेटअप नहीं हुई है (VAPID keys)।' }, 500)

  // 1) कौन बुला रहा है? — मालिक होना ज़रूरी
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json(req, { error: 'login ज़रूरी है' }, 401)
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) return json(req, { error: 'login ज़रूरी है' }, 401)
  const { data: isOwner } = await userClient.rpc('is_owner')
  if (isOwner !== true) return json(req, { error: 'सिर्फ़ मालिक सूचना भेज सकता है' }, 403)

  // 2) संदेश की जाँच
  let title = ''
  let body = ''
  let offerId = ''
  try {
    const b = await req.json()
    title = String(b?.title ?? '').trim().slice(0, 60)
    body = String(b?.body ?? '').trim().slice(0, 160)
    offerId = String(b?.offer_id ?? '')
  } catch {
    return json(req, { error: 'bad request' }, 400)
  }
  if (!title || !body) return json(req, { error: 'शीर्षक और संदेश दोनों लिखें' }, 400)

  const admin = serviceClient()
  if (!(await rateLimit(admin, 'offer_push', `user:${userData.user.id}`, MAX_SENDS_PER_HOUR, 60))) {
    return json(req, { error: `एक घंटे में ${MAX_SENDS_PER_HOUR} से ज़्यादा बार सूचना नहीं भेज सकते। बाद में कोशिश करें।` }, 429)
  }

  // 3) subscribers
  const { data: subs, error } = await admin
    .from('offer_push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
  if (error) {
    console.error('offer push: subscriptions read failed', error.message)
    return json(req, { error: 'database error' }, 500)
  }

  const payload = JSON.stringify({
    title,
    body,
    url: '/',
    tag: UUID_RE.test(offerId) ? `offer-${offerId}` : 'offer', // उसी ऑफर की नई सूचना पुरानी की जगह लेती है
    sticky: false,
  })

  const dead: string[] = []
  let sent = 0
  const list = subs ?? []
  for (let i = 0; i < list.length; i += BATCH) {
    await Promise.all(
      list.slice(i, i + BATCH).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
            payload,
            { TTL: 12 * 3600, urgency: 'normal', timeout: 10_000 },
          )
          sent++
        } catch (e) {
          const code = (e as { statusCode?: number })?.statusCode
          if (code === 404 || code === 410) dead.push(s.id) // ग्राहक ने अनुमति हटा दी / ब्राउज़र साफ़ किया
          else console.error('offer push: send failed', code, (e as Error)?.message)
        }
      }),
    )
  }
  if (dead.length) await admin.from('offer_push_subscriptions').delete().in('id', dead)

  return json(req, { sent, removed: dead.length, total: list.length })
})
