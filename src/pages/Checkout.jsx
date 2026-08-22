import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useSettings } from '../context/SettingsContext'
import { supabase } from '../supabaseClient'
import { startOnlinePayment } from '../utils/payment'
import { getCurrentLocationAddress } from '../utils/geolocation'
import Header from '../components/Header'
import { formatRupee, DELIVERY_TIME_SLOTS } from '../utils/format'

const STORAGE_KEY_CUSTOMER = 'aks_customer_v1'

export default function Checkout() {
  const { items, subtotal, clearCart } = useCart()
  const { settings } = useSettings()
  const navigate = useNavigate()

  const savedCustomer = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_CUSTOMER) || '{}')
    } catch {
      return {}
    }
  })()

  const [form, setForm] = useState({
    name: savedCustomer.name || '',
    phone: savedCustomer.phone || '',
    address: savedCustomer.address || '',
    mohalla: savedCustomer.mohalla || '',
    city: savedCustomer.city || 'Bhopal',
    pincode: savedCustomer.pincode || '',
    deliveryDate: '',
    deliveryTime: DELIVERY_TIME_SLOTS[0],
    notes: '',
    latitude: null,
    longitude: null,
  })
  const [coupon, setCoupon] = useState('')
  const [discount, setDiscount] = useState(0)
  const [couponMsg, setCouponMsg] = useState('')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState('')

  async function handleUseCurrentLocation() {
    setLocating(true)
    setLocationError('')
    try {
      const loc = await getCurrentLocationAddress()
      setForm((f) => ({
        ...f,
        address: loc.fullAddress || f.address,
        mohalla: loc.mohalla || f.mohalla,
        city: loc.city || f.city,
        pincode: loc.pincode || f.pincode,
        latitude: loc.lat,
        longitude: loc.lng,
      }))
    } catch (err) {
      setLocationError(typeof err === 'string' ? err : 'लोकेशन नहीं मिल सकी। कृपया पता खुद लिखें।')
    } finally {
      setLocating(false)
    }
  }

  const deliveryFee =
    settings.free_delivery_above && subtotal >= settings.free_delivery_above ? 0 : settings.delivery_fee
  const total = Math.max(0, subtotal + deliveryFee - discount)

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function validate() {
    const e = {}
    if (!form.name.trim()) e.name = 'नाम आवश्यक है'
    if (!/^[6-9]\d{9}$/.test(form.phone.trim())) e.phone = 'सही मोबाइल नंबर डालें (10 अंक)'
    if (!form.address.trim()) e.address = 'पूरा पता आवश्यक है'
    if (!form.city.trim()) e.city = 'शहर आवश्यक है'
    if (!/^\d{6}$/.test(form.pincode.trim())) e.pincode = 'सही पिन कोड डालें (6 अंक)'
    if (!form.deliveryDate) e.deliveryDate = 'डिलीवरी की तारीख चुनें'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function applyCoupon() {
    if (!coupon.trim()) return
    const { data } = await supabase
      .from('offers')
      .select('*')
      .eq('coupon_code', coupon.trim().toUpperCase())
      .eq('is_active', true)
      .maybeSingle()

    if (!data) {
      setCouponMsg('यह कूपन कोड मान्य नहीं है')
      setDiscount(0)
      return
    }
    if (data.min_order_value && subtotal < data.min_order_value) {
      setCouponMsg(`इस कूपन के लिए न्यूनतम ऑर्डर ${formatRupee(data.min_order_value)} होना चाहिए`)
      setDiscount(0)
      return
    }
    const calc = data.discount_type === 'percent' ? (subtotal * data.discount_value) / 100 : data.discount_value
    setDiscount(Math.min(calc, subtotal))
    setCouponMsg(`✅ कूपन लागू हुआ! आपको ${formatRupee(Math.min(calc, subtotal))} की छूट मिली`)
  }

  async function handlePayNow() {
    if (!validate()) return
    setPaymentError('')
    setSubmitting(true)

    localStorage.setItem(
      STORAGE_KEY_CUSTOMER,
      JSON.stringify({
        name: form.name,
        phone: form.phone,
        address: form.address,
        mohalla: form.mohalla,
        city: form.city,
        pincode: form.pincode,
      })
    )

    try {
      // 1. ग्राहक बनाएं या पहले से मौजूद ग्राहक ढूंढें
      let customerId = null
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', form.phone.trim())
        .maybeSingle()

      if (existingCustomer) {
        customerId = existingCustomer.id
      } else {
        const { data: newCustomer, error: custErr } = await supabase
          .from('customers')
          .insert({ full_name: form.name, phone: form.phone.trim() })
          .select('id')
          .single()
        if (custErr) throw custErr
        customerId = newCustomer.id
      }

      // 2. ऑर्डर बनाएं (शुरुआत में 'नया ऑर्डर' और भुगतान 'लंबित')
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          customer_id: customerId,
          customer_name: form.name,
          customer_phone: form.phone.trim(),
          full_address: form.address,
          mohalla: form.mohalla,
          city: form.city,
          pincode: form.pincode,
          delivery_date: form.deliveryDate,
          delivery_time_slot: form.deliveryTime,
          extra_notes: form.notes,
          latitude: form.latitude,
          longitude: form.longitude,
          subtotal,
          delivery_fee: deliveryFee,
          discount,
          coupon_code: coupon ? coupon.toUpperCase() : null,
          total_amount: total,
          payment_status: 'लंबित',
          payment_method: 'ऑनलाइन',
          order_status: 'नया ऑर्डर',
        })
        .select('*')
        .single()
      if (orderErr) throw orderErr

      // 3. ऑर्डर की वस्तुएँ (items) सेव करें
      const orderItems = items.map((i) => ({
        order_id: order.id,
        vegetable_id: i.vegetableId || i.id,
        vegetable_name: i.name,
        unit: i.unit,
        price: i.price,
        quantity: i.quantity,
        item_total: i.price * i.quantity,
        seller_id: i.sellerId || null,
        seller_name: i.sellerName || null,
      }))
      const { error: itemsErr } = await supabase.from('order_items').insert(orderItems)
      if (itemsErr) throw itemsErr

      // 4. ऑनलाइन भुगतान शुरू करें (Razorpay - UPI/कार्ड)
      startOnlinePayment({
        amount: total,
        orderNumber: order.order_number,
        customerName: form.name,
        customerPhone: form.phone,
        onSuccess: async (paymentResponse) => {
          await supabase.from('payments').insert({
            order_id: order.id,
            gateway: 'razorpay',
            gateway_payment_id: paymentResponse.razorpay_payment_id,
            amount: total,
            status: 'सफल',
          })
          await supabase
            .from('orders')
            .update({ payment_status: 'सफल', order_status: 'भुगतान सफल' })
            .eq('id', order.id)

          clearCart()
          navigate(`/order-confirmation/${order.id}`)
        },
        onFailure: async (message) => {
          await supabase.from('payments').insert({
            order_id: order.id,
            gateway: 'razorpay',
            amount: total,
            status: 'असफल',
          })
          await supabase.from('orders').update({ payment_status: 'असफल' }).eq('id', order.id)
          setPaymentError(message + ' कृपया दोबारा भुगतान करने का प्रयास करें।')
          setSubmitting(false)
          // दोबारा भुगतान के लिए ऑर्डर आईडी सेव रखें
          sessionStorage.setItem('aks_retry_order_id', order.id)
        },
      })
    } catch (err) {
      console.error(err)
      const detail = err?.message || err?.error_description || ''
      setPaymentError('कुछ गड़बड़ी हुई। कृपया दोबारा प्रयास करें।' + (detail ? ` (${detail})` : ''))
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen pb-40">
      <Header />
      <div className="px-4 py-4 animate-fade-slide-in">
        <h2 className="font-bold text-gray-800 text-lg mb-4">डिलीवरी की जानकारी</h2>

        <div className="flex flex-col gap-3">
          <Field label="ग्राहक का नाम" error={errors.name}>
            <input className="input-field" value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="अपना पूरा नाम लिखें" />
          </Field>

          <Field label="मोबाइल नंबर" error={errors.phone}>
            <input className="input-field" value={form.phone} onChange={(e) => updateField('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10 अंकों का मोबाइल नंबर" inputMode="numeric" />
          </Field>

          <div>
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={locating}
              className="w-full flex items-center justify-center gap-2 border-2 border-kisan text-kisan font-bold py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-60"
            >
              <span>📍</span>
              {locating ? 'लोकेशन ढूंढी जा रही है...' : 'मेरी वर्तमान लोकेशन का उपयोग करें'}
            </button>
            {locationError && <p className="text-red-500 text-xs mt-1.5 font-semibold">{locationError}</p>}
          </div>

          <Field label="पूरा पता" error={errors.address}>
            <textarea className="input-field" rows={2} value={form.address} onChange={(e) => updateField('address', e.target.value)} placeholder="मकान नंबर, गली नंबर आदि" />
          </Field>

          <Field label="मोहल्ला / कॉलोनी">
            <input className="input-field" value={form.mohalla} onChange={(e) => updateField('mohalla', e.target.value)} placeholder="मोहल्ला / कॉलोनी का नाम" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="शहर" error={errors.city}>
              <input className="input-field" value={form.city} onChange={(e) => updateField('city', e.target.value)} />
            </Field>
            <Field label="पिन कोड" error={errors.pincode}>
              <input className="input-field" value={form.pincode} onChange={(e) => updateField('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="डिलीवरी की तारीख" error={errors.deliveryDate}>
              <input type="date" className="input-field" min={new Date().toISOString().slice(0, 10)} value={form.deliveryDate} onChange={(e) => updateField('deliveryDate', e.target.value)} />
            </Field>
            <Field label="डिलीवरी का समय">
              <select className="input-field" value={form.deliveryTime} onChange={(e) => updateField('deliveryTime', e.target.value)}>
                {DELIVERY_TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="अतिरिक्त जानकारी (वैकल्पिक)">
            <textarea className="input-field" rows={2} value={form.notes} onChange={(e) => updateField('notes', e.target.value)} placeholder="कोई खास निर्देश हो तो लिखें" />
          </Field>
        </div>

        <div className="card p-4 mt-5">
          <h3 className="font-bold text-gray-700 text-sm mb-2">कूपन कोड</h3>
          <div className="flex gap-2">
            <input className="input-field flex-1" value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="कूपन कोड डालें" />
            <button onClick={applyCoupon} className="btn-outline px-4 py-0">लागू करें</button>
          </div>
          {couponMsg && <p className={`text-xs mt-2 font-semibold ${discount > 0 ? 'text-kisan' : 'text-red-500'}`}>{couponMsg}</p>}
        </div>

        <div className="card p-4 mt-4">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>सामान का कुल मूल्य</span>
            <span className="font-semibold">{formatRupee(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>डिलीवरी शुल्क</span>
            <span className="font-semibold">{deliveryFee === 0 ? 'मुफ़्त' : formatRupee(deliveryFee)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm text-kisan mb-2">
              <span>छूट</span>
              <span className="font-semibold">−{formatRupee(discount)}</span>
            </div>
          )}
          <div className="border-t border-dashed border-gray-200 mt-2 pt-2 flex justify-between font-extrabold text-gray-800">
            <span>कुल भुगतान राशि</span>
            <span className="text-kisan">{formatRupee(total)}</span>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold rounded-xl px-4 py-3 mt-4 flex items-center gap-2">
          <span>🔒</span>
          <span>केवल ऑनलाइन भुगतान उपलब्ध है (UPI / कार्ड / नेट बैंकिंग) — कैश ऑन डिलीवरी उपलब्ध नहीं है।</span>
        </div>

        {paymentError && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm font-semibold rounded-xl px-4 py-3 mt-3">
            ⚠️ {paymentError}
          </div>
        )}
      </div>

      <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-200 p-4 safe-bottom">
        <button onClick={handlePayNow} disabled={submitting} className="btn-primary w-full">
          {submitting ? 'प्रोसेस हो रहा है...' : `${formatRupee(total)} का ऑनलाइन भुगतान करें`}
        </button>
      </div>
    </div>
  )
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-600 mb-1">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1 font-semibold">{error}</p>}
    </div>
  )
}
