// supabase/functions/send-customer-push/index.ts
//
// ऑर्डर की स्थिति बदलते ही उस ऑर्डर से जुड़े ग्राहक-डिवाइसों पर Web Push भेजता है।
// database trigger (customer_push.sql → notify_order_status_push) इसे pg_net से बुलाता है।
//
// डिप्लॉय (JWT नहीं, shared-secret से सुरक्षित) — secrets वही हैं जो send-order-push में हैं:
//   supabase functions deploy send-customer-push --no-verify-jwt
import webpush from 'npm:web-push@3.6.7'
import { serviceClient, timingSafeEqual } from '../_shared/http.ts'

const SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'

const configured = !!(SECRET && VAPID_PUBLIC && VAPID_PRIVATE)
if (configured) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Lang = 'hi' | 'en'
type Msg = { title: Record<Lang, string>; body: Record<Lang, string> }

// {n} = ऑर्डर नंबर। 'नया ऑर्डर' पर सूचना नहीं (ग्राहक अभी-अभी ऑर्डर दे चुका है)।
const MESSAGES: Record<string, Msg> = {
  'भुगतान सफल': {
    title: { hi: '💰 भुगतान मिल गया', en: '💰 Payment received' },
    body: { hi: 'ऑर्डर {n} का भुगतान सफल रहा। धन्यवाद!', en: 'Payment for order {n} was successful. Thank you!' },
  },
  'स्वीकार किया गया': {
    title: { hi: '✅ ऑर्डर स्वीकार हो गया', en: '✅ Order accepted' },
    body: { hi: 'ऑर्डर {n} स्वीकार कर लिया गया है।', en: 'Your order {n} has been accepted.' },
  },
  'सामान तैयार हो रहा है': {
    title: { hi: '🧺 सामान तैयार हो रहा है', en: '🧺 Preparing your order' },
    body: { hi: 'ऑर्डर {n} की ताज़ी सब्ज़ियाँ पैक हो रही हैं।', en: 'Fresh vegetables for order {n} are being packed.' },
  },
  'डिलीवरी के लिए निकल गया': {
    title: { hi: '🛵 ऑर्डर रास्ते में है', en: '🛵 Order is on the way' },
    body: { hi: 'ऑर्डर {n} डिलीवरी के लिए निकल चुका है।', en: 'Order {n} is out for delivery.' },
  },
  'डिलीवरी पूरी हुई': {
    title: { hi: '🎉 ऑर्डर पहुँच गया', en: '🎉 Order delivered' },
    body: { hi: 'ऑर्डर {n} डिलीवर हो गया। हमें चुनने के लिए धन्यवाद!', en: 'Order {n} has been delivered. Thank you for choosing us!' },
  },
  'रद्द': {
    title: { hi: '❌ ऑर्डर रद्द हुआ', en: '❌ Order cancelled' },
    body: { hi: 'ऑर्डर {n} रद्द हो गया है। विवरण के लिए खोलें।', en: 'Order {n} was cancelled. Tap for details.' },
  },
}
const FINAL = ['डिलीवरी पूरी हुई', 'रद्द']
const OUT_FOR_DELIVERY = 'डिलीवरी के लिए निकल गया'

// false करने पर "निकल गया" सूचना में डिलीवरी बॉय का फ़ोन नंबर नहीं जाएगा (सिर्फ़ नाम जाएगा)
const SHARE_DELIVERY_PHONE = true

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!configured) return new Response('not configured', { status: 500 })
  if (!timingSafeEqual(SECRET, req.headers.get('x-push-secret') ?? '')) {
    return new Response('unauthorized', { status: 401 })
  }

  let orderId = ''
  let orderNumber = ''
  let status = ''
  try {
    const body = await req.json()
    orderId = String(body?.order_id ?? '')
    orderNumber = String(body?.order_number ?? '').slice(0, 40)
    status = String(body?.status ?? '')
  } catch {
    return new Response('bad request', { status: 400 })
  }
  if (!UUID_RE.test(orderId) || !orderNumber) return new Response('bad request', { status: 400 })

  const msg = MESSAGES[status]
  if (!msg) return new Response(JSON.stringify({ sent: 0, skipped: 'no message for status' }), {
    headers: { 'Content-Type': 'application/json' },
  })

  const admin = serviceClient()

  // "निकल गया" पर डिलीवरी बॉय की जानकारी (अगर ऑर्डर उसे सौंपा जा चुका हो — admin के सीधे बदलाव में हो सकता है कि अभी न हो)
  let rider = ''
  if (status === OUT_FOR_DELIVERY) {
    const { data: o } = await admin.from('orders').select('delivery_boy_id').eq('id', orderId).maybeSingle()
    if (o?.delivery_boy_id) {
      const { data: b } = await admin.from('delivery_boys').select('full_name, phone').eq('id', o.delivery_boy_id).maybeSingle()
      const name = String(b?.full_name ?? '').trim().slice(0, 40)
      const phone = String(b?.phone ?? '').replace(/\D/g, '').slice(-10)
      if (name) rider = SHARE_DELIVERY_PHONE && phone.length === 10 ? `${name} (${phone})` : name
    }
  }

  const { data: subs, error } = await admin
    .from('customer_push_subscriptions')
    .select('id, endpoint, p256dh, auth_key, lang')
    .eq('order_id', orderId)
  if (error) {
    console.error('customer push: subscriptions read failed', error.message)
    return new Response('db error', { status: 500 })
  }

  const dead: string[] = []
  let sent = 0
  await Promise.all(
    (subs ?? []).map(async (s) => {
      const lang: Lang = s.lang === 'en' ? 'en' : 'hi'
      const payload = JSON.stringify({
        title: msg.title[lang],
        body: msg.body[lang].replace('{n}', orderNumber)
          + (rider ? (lang === 'en' ? ` Delivery partner: ${rider}.` : ` डिलीवरी बॉय: ${rider}।`) : ''),
        url: `/order-confirmation/${orderId}`,
        tag: `order-status-${orderNumber}`, // नई स्थिति पुरानी सूचना की जगह लेती है
        sticky: false, // ग्राहक की सूचना अपने-आप हट सकती है (एडमिन वाली नहीं हटती)
      })
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
          payload,
          { TTL: 6 * 3600, urgency: 'high', timeout: 10_000 },
        )
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode
        if (code === 404 || code === 410) dead.push(s.id) // ग्राहक ने अनुमति हटा दी / ब्राउज़र साफ़ किया
        else console.error('customer push: send failed', code, (e as Error)?.message)
      }
    }),
  )
  if (dead.length) await admin.from('customer_push_subscriptions').delete().in('id', dead)

  // ऑर्डर बंद हो गया: अब इस ऑर्डर की subscriptions की ज़रूरत नहीं
  if (FINAL.includes(status)) await admin.from('customer_push_subscriptions').delete().eq('order_id', orderId)

  return new Response(JSON.stringify({ sent, removed: dead.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
