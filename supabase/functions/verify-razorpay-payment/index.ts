// supabase/functions/verify-razorpay-payment/index.ts
//
// Razorpay Checkout के handler से मिले (order_id, payment_id, signature) को सर्वर पर जाँचता है।
// HMAC-SHA256 मिलने पर ही ऑर्डर "भुगतान सफल" होता है (mark_order_paid, सिर्फ़ service_role) — C4।
//
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
import { clientIp, hmacHex, json, preflight, rateLimit, serviceClient, timingSafeEqual, UUID_RE } from '../_shared/http.ts'

const KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') ?? ''
const KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') ?? ''

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json(req, { error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    if (!KEY_ID || !KEY_SECRET) return json(req, { error: 'PAYMENT_NOT_CONFIGURED' }, 500)

    const b = await req.json().catch(() => ({}))
    const orderId = String(b?.order_id ?? '')
    const token = String(b?.access_token ?? '')
    const rzpOrderId = String(b?.razorpay_order_id ?? '')
    const rzpPaymentId = String(b?.razorpay_payment_id ?? '')
    const signature = String(b?.razorpay_signature ?? '')
    if (!UUID_RE.test(orderId) || !UUID_RE.test(token) || !/^order_\w{6,40}$/.test(rzpOrderId)
        || !/^pay_\w{6,40}$/.test(rzpPaymentId) || !/^[0-9a-f]{64}$/i.test(signature)) {
      return json(req, { error: 'BAD_REQUEST' }, 400)
    }

    const admin = serviceClient()
    if (!(await rateLimit(admin, 'rzp_verify', `ip:${clientIp(req)}`, 30, 10))) {
      return json(req, { error: 'RATE_LIMITED' }, 429)
    }

    const { data: order } = await admin
      .from('orders').select('id, total_amount, payment_status')
      .eq('id', orderId).eq('access_token', token).maybeSingle()
    if (!order) return json(req, { error: 'ORDER_NOT_FOUND' }, 404)
    if (order.payment_status === 'सफल') return json(req, { ok: true, already: true })

    // यह Razorpay order इसी ऑर्डर के लिए हमने ही बनाया था?
    const { data: pay } = await admin
      .from('payments').select('id').eq('order_id', orderId).eq('gateway_order_id', rzpOrderId).maybeSingle()
    if (!pay) return json(req, { error: 'PAYMENT_MISMATCH' }, 400)

    const expected = await hmacHex(KEY_SECRET, `${rzpOrderId}|${rzpPaymentId}`)
    if (!timingSafeEqual(expected, signature.toLowerCase())) return json(req, { error: 'BAD_SIGNATURE' }, 400)

    // अतिरिक्त जाँच: Razorpay से भुगतान की राशि/स्थिति (नेटवर्क फेल हो तो signature ही प्रमाण है)
    let method: string | null = null
    try {
      const r = await fetch(`https://api.razorpay.com/v1/payments/${rzpPaymentId}`, {
        headers: { Authorization: 'Basic ' + btoa(`${KEY_ID}:${KEY_SECRET}`) },
      })
      if (r.ok) {
        const p = await r.json()
        method = p.method ?? null
        const okStatus = p.status === 'captured' || p.status === 'authorized'
        if (!okStatus || p.order_id !== rzpOrderId || Number(p.amount) !== Math.round(Number(order.total_amount) * 100)) {
          console.error('razorpay payment check failed', { status: p.status, order: p.order_id, amount: p.amount })
          return json(req, { error: 'PAYMENT_MISMATCH' }, 400)
        }
      }
    } catch (e) {
      console.error('razorpay payment fetch failed (signature verified, continuing)', e)
    }

    const { data: result, error } = await admin.rpc('mark_order_paid', {
      p_order_id: orderId, p_gateway_order_id: rzpOrderId, p_payment_id: rzpPaymentId,
      p_signature: signature.toLowerCase(), p_method: method, p_amount: Number(order.total_amount),
    })
    if (error) throw error
    if (result === 'ok' || result === 'already') return json(req, { ok: true })
    console.error('mark_order_paid result', result)
    return json(req, { error: 'PAYMENT_MISMATCH' }, 409)
  } catch (err) {
    console.error('verify-razorpay-payment', err)
    return json(req, { error: 'SERVER_ERROR' }, 500)
  }
})
