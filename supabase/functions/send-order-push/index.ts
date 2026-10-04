// supabase/functions/send-order-push/index.ts
//
// नया ऑर्डर बनते ही सभी एडमिन डिवाइसों पर Web Push भेजता है।
// database trigger (push_notifications.sql) इसे pg_net से बुलाता है।
//
// डिप्लॉय (JWT नहीं, shared-secret से सुरक्षित):
//   supabase functions deploy send-order-push --no-verify-jwt
// Edge secrets:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (जैसे mailto:aap@example.com), PUSH_WEBHOOK_SECRET
import webpush from 'npm:web-push@3.6.7'
import { serviceClient, timingSafeEqual } from '../_shared/http.ts'

const SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'

const configured = !!(SECRET && VAPID_PUBLIC && VAPID_PRIVATE)
if (configured) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!configured) return new Response('not configured', { status: 500 })
  if (!timingSafeEqual(SECRET, req.headers.get('x-push-secret') ?? '')) {
    return new Response('unauthorized', { status: 401 })
  }

  let orderNumber = ''
  try {
    const body = await req.json()
    orderNumber = String(body?.order_number ?? '').slice(0, 40)
  } catch {
    return new Response('bad request', { status: 400 })
  }
  if (!orderNumber) return new Response('bad request', { status: 400 })

  const admin = serviceClient()

  // ऑर्डर बनने के बाद रकम भरी जाती है, इसलिए ताज़ा पढ़ते हैं
  const { data: order } = await admin
    .from('orders')
    .select('order_number, customer_name, total_amount, payment_method')
    .eq('order_number', orderNumber)
    .maybeSingle()

  const name = String(order?.customer_name ?? '').slice(0, 40)
  const total = Math.round(Number(order?.total_amount ?? 0))
  const parts = [orderNumber, name, total > 0 ? `₹${total}` : '']
  if (order?.payment_method === 'COD') parts.push('💵 COD')
  const payload = JSON.stringify({
    title: '🆕 नया ऑर्डर आया',
    body: parts.filter(Boolean).join(' • '),
    url: '/admin/orders',
    tag: `order-${orderNumber}`,
  })

  const { data: subs, error } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth_key')
  if (error) {
    console.error('push: subscriptions read failed', error.message)
    return new Response('db error', { status: 500 })
  }

  const dead: string[] = []
  let sent = 0
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
          payload,
          { TTL: 3600, urgency: 'high', timeout: 10_000 },
        )
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode
        if (code === 404 || code === 410) dead.push(s.id) // डिवाइस ने अनुमति हटा दी / ऐप हटा दिया
        else console.error('push: send failed', code, (e as Error)?.message)
      }
    }),
  )
  if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead)

  return new Response(JSON.stringify({ sent, removed: dead.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
