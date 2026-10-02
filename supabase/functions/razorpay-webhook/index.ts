// supabase/functions/razorpay-webhook/index.ts
//
// Razorpay → हमारा सर्वर (reconciliation). ग्राहक का नेटवर्क टूटने/ब्राउज़र बंद होने पर भी
// payment.captured / order.paid आने पर ऑर्डर "भुगतान सफल" हो जाता है।
//
// डिप्लॉय (बिना JWT, क्योंकि Razorpay JWT नहीं भेजता — सुरक्षा signature से है):
//   supabase functions deploy razorpay-webhook --no-verify-jwt
// Razorpay Dashboard → Settings → Webhooks: URL = https://<project>.supabase.co/functions/v1/razorpay-webhook
//   Events: payment.captured, order.paid   |  Secret → RAZORPAY_WEBHOOK_SECRET
import { hmacHex, serviceClient, timingSafeEqual } from '../_shared/http.ts'

const WEBHOOK_SECRET = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') ?? ''

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!WEBHOOK_SECRET) return new Response('not configured', { status: 500 })

  const raw = await req.text()
  const sig = (req.headers.get('x-razorpay-signature') ?? '').toLowerCase()
  const expected = await hmacHex(WEBHOOK_SECRET, raw)
  if (!sig || !timingSafeEqual(expected, sig)) return new Response('bad signature', { status: 400 })

  try {
    const evt = JSON.parse(raw)
    const type: string = evt?.event ?? ''
    if (type !== 'payment.captured' && type !== 'order.paid') return new Response('ignored', { status: 200 })

    const pay = evt?.payload?.payment?.entity
    const rzpOrderId: string | undefined = pay?.order_id ?? evt?.payload?.order?.entity?.id
    if (!pay?.id || !rzpOrderId) return new Response('ignored', { status: 200 })

    const admin = serviceClient()
    const { data: row } = await admin.from('payments').select('order_id').eq('gateway_order_id', rzpOrderId).maybeSingle()
    if (!row) {
      console.error('webhook: unknown razorpay order', rzpOrderId)
      return new Response('unknown order', { status: 200 }) // 200 ताकि Razorpay बार-बार retry न करे
    }

    const { data: result, error } = await admin.rpc('mark_order_paid', {
      p_order_id: row.order_id, p_gateway_order_id: rzpOrderId, p_payment_id: pay.id,
      p_signature: null, p_method: pay.method ?? null, p_amount: Number(pay.amount) / 100,
    })
    if (error) throw error
    if (result === 'amount_mismatch') console.error('webhook: AMOUNT MISMATCH — manual review needed', rzpOrderId, pay.id)
    return new Response(String(result), { status: 200 })
  } catch (err) {
    console.error('razorpay-webhook', err)
    return new Response('error', { status: 500 }) // Razorpay दोबारा भेजेगा
  }
})
