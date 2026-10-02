import { bi } from './translations.js'
/**
 * ऑनलाइन भुगतान (Razorpay Checkout) — UPI, कार्ड, नेट बैंकिंग।
 *
 * सुरक्षित प्रवाह (Production Audit C4):
 *   1. place_order RPC ऑर्डर बनाता है (राशि सर्वर तय करता है)
 *   2. create-razorpay-order Edge Function Razorpay का order_id बनाती है (राशि DB के ऑर्डर से)
 *   3. Razorpay Checkout इसी order_id के साथ खुलता है
 *   4. सफल होने पर verify-razorpay-payment सर्वर पर HMAC signature जाँचकर ऑर्डर "भुगतान सफल" करती है
 *   5. ब्राउज़र टूटे तो razorpay-webhook यही काम करता है (reconciliation)
 * ब्राउज़र खुद payments/orders में कभी "सफल" नहीं लिखता।
 */
import { supabase } from '../supabaseClient'

export function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true)
    const existing = document.querySelector('script[data-razorpay]')
    if (existing) {
      existing.addEventListener('load', () => resolve(true))
      existing.addEventListener('error', () => resolve(false))
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.dataset.razorpay = '1'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    // Edge Function का JSON error body पढ़ने की कोशिश
    let code = 'UNKNOWN'
    try {
      const j = await error.context?.json?.()
      if (j?.error) code = j.error
    } catch {
      /* ignore */
    }
    throw Object.assign(new Error(code), { code })
  }
  if (data?.error) throw Object.assign(new Error(data.error), { code: data.error })
  return data
}

/**
 * भुगतान शुरू करता है।
 * callbacks: onVerified() — सर्वर ने भुगतान पक्का किया | onPending(message) — पैसा कट सकता है पर पुष्टि बाकी |
 *            onFailure(message) — असफल/रद्द (ऑर्डर "लंबित" ही रहता है; दोबारा कोशिश वही ऑर्डर इस्तेमाल करती है)
 */
export async function startOnlinePayment({ orderId, accessToken, customerName, customerPhone, orderNumber, onVerified, onPending, onFailure }) {
  const scriptLoaded = await loadRazorpayScript()
  if (!scriptLoaded) {
    onFailure(bi('भुगतान गेटवे लोड नहीं हो सका। इंटरनेट कनेक्शन जांचें।', 'Could not load the payment gateway. Check your internet connection.'))
    return
  }

  let rzpOrder
  try {
    rzpOrder = await invoke('create-razorpay-order', { order_id: orderId, access_token: accessToken })
  } catch (e) {
    onFailure(e.code === 'PAYMENT_NOT_CONFIGURED' ? bi('भुगतान सेटअप अधूरा है। एडमिन से संपर्क करें।', 'Payment setup is incomplete. Please contact the admin.') : bi('भुगतान शुरू नहीं हो सका। कृपया दोबारा प्रयास करें।', 'Could not start the payment. Please try again.'))
    return
  }
  if (rzpOrder.already_paid) {
    onVerified()
    return
  }

  let settled = false
  const options = {
    key: rzpOrder.key_id || import.meta.env.VITE_RAZORPAY_KEY_ID,
    amount: rzpOrder.amount,
    currency: rzpOrder.currency || 'INR',
    order_id: rzpOrder.razorpay_order_id,
    name: 'अपना किसान सब्ज़ीवाला',
    description: bi(`ऑर्डर ${orderNumber} का भुगतान`, `Payment for order ${orderNumber}`),
    prefill: { name: customerName, contact: customerPhone },
    theme: { color: '#1e7d32' },
    method: { upi: true, card: true, netbanking: true, wallet: true },
    handler: async function (response) {
      settled = true
      try {
        await invoke('verify-razorpay-payment', {
          order_id: orderId,
          access_token: accessToken,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        })
        onVerified()
      } catch {
        // पैसा कट चुका हो सकता है, पर पुष्टि नहीं हुई — webhook इसे पूरा कर देगा। नया ऑर्डर/भुगतान न कराएँ।
        onPending(bi('भुगतान की पुष्टि हो रही है। कृपया दोबारा भुगतान न करें — कुछ देर में ऑर्डर की स्थिति अपने आप अपडेट हो जाएगी।', 'Confirming your payment. Please do not pay again — the order status will update automatically shortly.'))
      }
    },
    modal: {
      ondismiss: function () {
        if (!settled) onFailure(bi('भुगतान रद्द कर दिया गया।', 'Payment was cancelled.'))
      },
    },
  }

  const rzp = new window.Razorpay(options)
  rzp.on('payment.failed', function (response) {
    onFailure(response?.error?.description || bi('भुगतान असफल हुआ। कृपया दोबारा प्रयास करें।', 'Payment failed. Please try again.'))
  })
  rzp.open()
}
