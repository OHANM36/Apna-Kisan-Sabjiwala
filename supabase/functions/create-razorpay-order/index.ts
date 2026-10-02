// supabase/functions/create-razorpay-order/index.ts
//
// ऑर्डर बनने के बाद (place_order RPC) Razorpay का order_id सर्वर पर बनाता है।
// राशि हमेशा DB के ऑर्डर से आती है — client से कभी नहीं (Production Audit C4)।
//
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET  (+ वैकल्पिक ALLOWED_ORIGINS)
//   supabase secrets set RAZORPAY_KEY_ID=rzp_live_xxx RAZORPAY_KEY_SECRET=xxxx
import { clientIp, json, preflight, rateLimit, serviceClient, UUID_RE } from '../_shared/http.ts'

const KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') ?? ''
const KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') ?? ''

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json(req, { error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    if (!KEY_ID || !KEY_SECRET) return json(req, { error: 'PAYMENT_NOT_CONFIGURED' }, 500)

    const body = await req.json().catch(() => ({}))
    const orderId = String(body?.order_id ?? '')
    const token = String(body?.access_token ?? '')
    if (!UUID_RE.test(orderId) || !UUID_RE.test(token)) return json(req, { error: 'BAD_REQUEST' }, 400)

    const admin = serviceClient()
    if (!(await rateLimit(admin, 'rzp_create', `ip:${clientIp(req)}`, 30, 10))) {
      return json(req, { error: 'RATE_LIMITED' }, 429)
    }

    const { data: order, error } = await admin
      .from('orders')
      .select('id, order_number, total_amount, payment_status, order_status')
      .eq('id', orderId)
      .eq('access_token', token)
      .maybeSingle()
    if (error) throw error
    if (!order) return json(req, { error: 'ORDER_NOT_FOUND' }, 404)
    if (order.payment_status === 'सफल') return json(req, { already_paid: true })
    if (order.order_status === 'रद्द') return json(req, { error: 'ORDER_CANCELLED' }, 409)

    const amount = Math.round(Number(order.total_amount) * 100)
    if (!Number.isFinite(amount) || amount < 100) return json(req, { error: 'AMOUNT_TOO_LOW' }, 400)

    // पहले से बना (अधूरा) Razorpay order हो तो वही दोबारा इस्तेमाल करें — retry पर नया order नहीं
    const { data: existing } = await admin
      .from('payments')
      .select('gateway_order_id')
      .eq('order_id', orderId)
      .eq('status', 'लंबित')
      .not('gateway_order_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing?.gateway_order_id) {
      return json(req, { razorpay_order_id: existing.gateway_order_id, amount, currency: 'INR', key_id: KEY_ID })
    }

    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa(`${KEY_ID}:${KEY_SECRET}`) },
      body: JSON.stringify({ amount, currency: 'INR', receipt: order.order_number, notes: { order_id: order.id } }),
    })
    if (!res.ok) {
      console.error('razorpay order create failed', res.status, await res.text())
      return json(req, { error: 'GATEWAY_ERROR' }, 502)
    }
    const rzp = await res.json()

    const { error: insErr } = await admin.from('payments').insert({
      order_id: order.id, gateway: 'razorpay', gateway_order_id: rzp.id, amount: order.total_amount, status: 'लंबित',
    })
    if (insErr) throw insErr

    return json(req, { razorpay_order_id: rzp.id, amount, currency: 'INR', key_id: KEY_ID })
  } catch (err) {
    console.error('create-razorpay-order', err)
    return json(req, { error: 'SERVER_ERROR' }, 500)
  }
})
