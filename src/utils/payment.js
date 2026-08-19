/**
 * ऑनलाइन भुगतान (Razorpay Checkout) - UPI, कार्ड, नेट बैंकिंग सपोर्ट करता है
 *
 * नोट: प्रोडक्शन में ऑर्डर बनाना और भुगतान वेरीफाई करना हमेशा एक सर्वर
 * (Supabase Edge Function) से किया जाना चाहिए ताकि राशि से छेड़छाड़ न हो सके।
 * यहाँ Supabase Edge Function 'create-razorpay-order' और 'verify-razorpay-payment'
 * को कॉल करने का ढांचा दिया गया है - देखें supabase/functions/ फोल्डर के निर्देश README में।
 */

import { supabase } from '../supabaseClient'

export function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true)
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

/**
 * भुगतान शुरू करता है। सफल होने पर onSuccess(paymentResponse), असफल/बंद होने पर onFailure() कॉल होता है।
 */
export async function startOnlinePayment({ amount, orderNumber, customerName, customerPhone, onSuccess, onFailure }) {
  const scriptLoaded = await loadRazorpayScript()
  if (!scriptLoaded) {
    onFailure('भुगतान गेटवे लोड नहीं हो सका। इंटरनेट कनेक्शन जांचें।')
    return
  }

  const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID
  if (!keyId) {
    onFailure('भुगतान सेटअप अधूरा है। एडमिन से संपर्क करें।')
    return
  }

  // प्रोडक्शन सेटअप: यहां Supabase Edge Function को कॉल करके सर्वर-साइड
  // Razorpay order_id जनरेट करें (देखें README.md का "ऑनलाइन भुगतान सेटअप" भाग)।
  // उदाहरण:
  // const { data } = await supabase.functions.invoke('create-razorpay-order', { body: { amount } })
  // const razorpayOrderId = data.id

  const options = {
    key: keyId,
    amount: Math.round(amount * 100), // पैसे में (rupees * 100)
    currency: 'INR',
    name: 'अपना किसान सब्ज़ीवाला',
    description: `ऑर्डर ${orderNumber} का भुगतान`,
    // order_id: razorpayOrderId, // सर्वर-साइड सेटअप के बाद यह लाइन जोड़ें
    prefill: {
      name: customerName,
      contact: customerPhone,
    },
    theme: { color: '#1e7d32' },
    method: {
      upi: true,
      card: true,
      netbanking: true,
      wallet: true,
    },
    handler: function (response) {
      onSuccess(response)
    },
    modal: {
      ondismiss: function () {
        onFailure('भुगतान रद्द कर दिया गया।')
      },
    },
  }

  const rzp = new window.Razorpay(options)
  rzp.on('payment.failed', function (response) {
    onFailure(response?.error?.description || 'भुगतान असफल हुआ। कृपया दोबारा प्रयास करें।')
  })
  rzp.open()
}
