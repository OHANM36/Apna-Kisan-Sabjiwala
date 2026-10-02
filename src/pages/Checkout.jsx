import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useSettings } from '../context/SettingsContext'
import { supabase } from '../supabaseClient'
import { startOnlinePayment } from '../utils/payment'
import { codAvailability, PAYMENT_COD, PAYMENT_ONLINE } from '../utils/paymentMethods'
import { getCurrentLocationAddress } from '../utils/geolocation'
import Header from '../components/Header'
import { useLanguage } from '../context/LanguageContext'
import { formatRupee, DELIVERY_TIME_SLOTS, istNow, addDays, isSlotAvailable, defaultDelivery } from '../utils/format'
import { calculateDeliveryFee, minOrderShortfall } from '../pricing/delivery'
import { tierKeyFromLineId } from '../pricing/cartSync'
import { safeGet, safeSet, safeRemove, safeJson } from '../utils/safeStorage'
import { saveMyOrder } from '../utils/myOrders'
import { friendlyError, withTimeout } from '../utils/errors'

const STORAGE_KEY_CUSTOMER = 'aks_customer_v1'

export default function Checkout() {
  const { items, subtotal, clearCart, syncPrices } = useCart()
  const { settings, deliveryRules, loading: settingsLoading, reloadSettings } = useSettings()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const savedCustomer = safeJson(STORAGE_KEY_CUSTOMER, {}) || {}
  const attempt = useRef({ signature: '', key: '', placed: null })

  // अभी का भारतीय समय (हर मिनट ताज़ा) — तारीख/स्लॉट की जाँच इसी से
  const [now, setNow] = useState(() => istNow())
  useEffect(() => {
    const id = setInterval(() => setNow(istNow()), 60000)
    return () => clearInterval(id)
  }, [])
  const initialDelivery = useRef(defaultDelivery(istNow())).current

  const [form, setForm] = useState({
    name: savedCustomer.name || '',
    phone: savedCustomer.phone || '',
    address: savedCustomer.address || '',
    mohalla: savedCustomer.mohalla || '',
    city: savedCustomer.city || 'Bhopal',
    pincode: savedCustomer.pincode || '',
    deliveryDate: initialDelivery.date, // पहली उपलब्ध तारीख/स्लॉट अपने-आप भरा (ग्राहक बदल सकता है)
    deliveryTime: initialDelivery.slot,
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
  const [payMethod, setPayMethod] = useState(PAYMENT_ONLINE) // डिफ़ॉल्ट ऑनलाइन — COD ग्राहक खुद चुने

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

  const { fee: deliveryFee } = calculateDeliveryFee(subtotal, deliveryRules, settings)
  const total = Math.max(0, subtotal + deliveryFee - discount)
  const shortfall = minOrderShortfall(subtotal, settings.min_order_value)
  // COD तभी जब एडमिन ने चालू किया हो और राशि सीमा के अंदर हो (कार्ट बढ़ने पर अपने-आप ऑनलाइन पर लौटता है)
  const cod = codAvailability(settings, total)
  const method = cod.available && payMethod === PAYMENT_COD ? PAYMENT_COD : PAYMENT_ONLINE

  // सीधे /checkout खोलने पर भी न्यूनतम ऑर्डर लागू रहे
  useEffect(() => {
    if (!settingsLoading && items.length > 0 && shortfall > 0) navigate('/cart', { replace: true })
  }, [settingsLoading, items.length, shortfall, navigate])

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // आज कोई स्लॉट बचा है? नहीं तो सबसे जल्दी की तारीख कल है
  const todayHasSlot = DELIVERY_TIME_SLOTS.some((sl) => isSlotAvailable(sl, now.date, now))
  const minDate = todayHasSlot ? now.date : addDays(now.date, 1)
  const maxDate = addDays(now.date, 14)

  // समय आगे बढ़ने/तारीख बदलने पर पुरानी तारीख या निकल चुके स्लॉट को अपने-आप सुधारें
  useEffect(() => {
    setForm((f) => {
      const date = !f.deliveryDate || f.deliveryDate < minDate ? minDate : f.deliveryDate
      const slot = isSlotAvailable(f.deliveryTime, date, now)
        ? f.deliveryTime
        : DELIVERY_TIME_SLOTS.find((sl) => isSlotAvailable(sl, date, now)) || f.deliveryTime
      return date === f.deliveryDate && slot === f.deliveryTime ? f : { ...f, deliveryDate: date, deliveryTime: slot }
    })
  }, [now, minDate])

  function validate() {
    const e = {}
    if (!form.name.trim()) e.name = 'नाम आवश्यक है'
    if (!/^[6-9]\d{9}$/.test(form.phone.trim())) e.phone = 'सही मोबाइल नंबर डालें (10 अंक)'
    if (!form.address.trim()) e.address = 'पूरा पता आवश्यक है'
    if (!form.city.trim()) e.city = 'शहर आवश्यक है'
    if (!/^\d{6}$/.test(form.pincode.trim())) e.pincode = 'सही पिन कोड डालें (6 अंक)'
    if (!form.deliveryDate) e.deliveryDate = 'डिलीवरी की तारीख चुनें'
    else if (form.deliveryDate < minDate || form.deliveryDate > maxDate) e.deliveryDate = 'सही तारीख चुनें'
    else if (!isSlotAvailable(form.deliveryTime, form.deliveryDate, istNow())) e.deliveryTime = t('checkout_slot_invalid')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function applyCoupon() {
    if (!coupon.trim()) return
    try {
      // जाँच सर्वर पर होती है (offers टेबल की सारी पंक्तियाँ ब्राउज़र को नहीं भेजी जातीं)
      const { data, error } = await withTimeout(
        supabase.rpc('validate_coupon', { p_code: coupon.trim(), p_subtotal: subtotal, p_phone: form.phone.trim() || null })
      )
      if (error) throw error
      if (!data?.ok) {
        setCouponMsg(data?.error === 'COUPON_MIN_ORDER' && data.min_order_value
          ? `इस कूपन के लिए न्यूनतम ऑर्डर ${formatRupee(data.min_order_value)} होना चाहिए`
          : friendlyError(data?.error))
        setDiscount(0)
        return
      }
      setDiscount(Number(data.discount) || 0)
      setCouponMsg(`✅ कूपन लागू हुआ! आपको ${formatRupee(data.discount)} की छूट मिली`)
    } catch (err) {
      setCouponMsg(friendlyError(err))
      setDiscount(0)
    }
  }

  // कार्ट-लाइन → सर्वर को सिर्फ़ (सब्ज़ी id, मात्रा, tier); कीमत कभी नहीं भेजी जाती
  function buildOrderItems() {
    return items.map((i) => {
      const tierKey = tierKeyFromLineId(i.id)
      const line = { vegetable_id: i.vegetableId || String(i.id).split('::')[0], quantity: i.quantity }
      if (tierKey) {
        const dash = tierKey.indexOf('-')
        line.tier_qty = Number(tierKey.slice(0, dash))
        line.tier_unit = tierKey.slice(dash + 1)
      }
      return line
    })
  }

  async function handlePayNow() {
    if (submitting) return // double-click पर दूसरा ऑर्डर नहीं (H4)
    if (!validate()) return
    setPaymentError('')
    if (shortfall > 0) {
      setPaymentError(t('cart_min_order_msg').replace('{min}', settings.min_order_value).replace('{add}', shortfall))
      return
    }
    setSubmitting(true)

    try {
      // ऑर्डर बनाने से ठीक पहले कीमतें ताज़ा प्रकाशित कीमतों से मिलाएं; बदली हों तो ग्राहक को दिखाकर रुकें
      const fresh = await syncPrices()
      if (fresh.removed.length || fresh.changed.length) {
        setPaymentError(fresh.removed.length ? t('cart_items_removed') : t('cart_prices_updated'))
        setSubmitting(false)
        return
      }

      safeSet(
        STORAGE_KEY_CUSTOMER,
        JSON.stringify({ name: form.name, phone: form.phone, address: form.address, mohalla: form.mohalla, city: form.city, pincode: form.pincode })
      )

      const orderItems = buildOrderItems()
      const customer = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        mohalla: form.mohalla.trim(),
        city: form.city.trim(),
        pincode: form.pincode.trim(),
        delivery_date: form.deliveryDate,
        delivery_time_slot: form.deliveryTime,
        notes: form.notes,
        lat: form.latitude,
        lng: form.longitude,
        order_source: safeGet('aks_order_source', 'session') || 'वेबसाइट',
        payment_method: method === PAYMENT_COD ? 'COD' : 'ONLINE', // असली जाँच (चालू? सीमा?) सर्वर पर होती है
      }

      // वही कार्ट+फ़ॉर्म दोबारा सबमिट हो (retry/double-click) तो वही idempotency key → वही ऑर्डर
      const signature = JSON.stringify([orderItems, customer, coupon.trim().toUpperCase()])
      if (attempt.current.signature !== signature) {
        attempt.current = { signature, key: crypto.randomUUID(), placed: null }
      }

      let placed = attempt.current.placed
      if (!placed) {
        const { data, error } = await withTimeout(
          supabase.rpc('place_order', {
            p_idem: attempt.current.key,
            p_customer: customer,
            p_items: orderItems,
            p_coupon: coupon.trim() || null,
          })
        )
        if (error) throw error
        placed = data
        attempt.current.placed = placed
        saveMyOrder({ id: placed.order_id, token: placed.access_token, orderNumber: placed.order_number })
      }

      const finish = () => {
        clearCart()
        safeRemove('aks_order_source', 'session')
        navigate(`/order-confirmation/${placed.order_id}`)
      }

      if (placed.payment_status === 'सफल') {
        finish()
        return
      }

      // कैश ऑन डिलीवरी: ऑर्डर बन गया, भुगतान डिलीवरी पर — Razorpay नहीं खुलेगा
      if (placed.payment_method === 'COD') {
        finish()
        return
      }

      // ऑनलाइन भुगतान (Razorpay). "सफल" सिर्फ़ सर्वर की signature-जाँच/webhook से लिखा जाता है।
      await startOnlinePayment({
        orderId: placed.order_id,
        accessToken: placed.access_token,
        orderNumber: placed.order_number,
        customerName: form.name,
        customerPhone: form.phone,
        onVerified: finish,
        onPending: (message) => {
          clearCart()
          navigate(`/order-confirmation/${placed.order_id}`, { state: { notice: message } })
        },
        onFailure: (message) => {
          setPaymentError(message + ' कृपया दोबारा भुगतान करने का प्रयास करें।')
          setSubmitting(false) // वही ऑर्डर दोबारा इस्तेमाल होगा, नया नहीं बनेगा
        },
      })
    } catch (err) {
      console.error(err)
      setPaymentError(friendlyError(err)) // तकनीकी error.message ग्राहक को नहीं दिखता
      if (/COD_DISABLED/.test(String(err?.message))) {
        setPayMethod(PAYMENT_ONLINE)
        reloadSettings() // एडमिन ने COD बंद कर दिया — ताज़ा सेटिंग लाएँ
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen pb-40">
      <Header />
      <div className="px-4 py-4 animate-fade-slide-in">
        <h2 className="font-bold text-gray-800 text-lg mb-4">{t('checkout_delivery_info')}</h2>

        <div className="flex flex-col gap-3">
          <Field label={t('checkout_customer_name')} error={errors.name}>
            <input className="input-field" value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder={t('checkout_name_placeholder')} />
          </Field>

          <Field label={t('checkout_phone')} error={errors.phone}>
            <input className="input-field" value={form.phone} onChange={(e) => updateField('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder={t('checkout_phone_placeholder')} inputMode="numeric" />
          </Field>

          <div>
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={locating}
              className="w-full flex items-center justify-center gap-2 border-2 border-kisan text-kisan font-bold py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-60"
            >
              <span>📍</span>
              {locating ? t('checkout_locating') : t('checkout_use_location')}
            </button>
            {locationError && <p className="text-red-500 text-xs mt-1.5 font-semibold">{locationError}</p>}
          </div>

          <Field label={t('checkout_address')} error={errors.address}>
            <textarea className="input-field" rows={2} value={form.address} onChange={(e) => updateField('address', e.target.value)} placeholder={t('checkout_address_placeholder')} />
          </Field>

          <Field label={t('checkout_mohalla')}>
            <input className="input-field" value={form.mohalla} onChange={(e) => updateField('mohalla', e.target.value)} placeholder={t('checkout_mohalla')} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('checkout_city')} error={errors.city}>
              <input className="input-field" value={form.city} onChange={(e) => updateField('city', e.target.value)} />
            </Field>
            <Field label={t('checkout_pincode')} error={errors.pincode}>
              <input className="input-field" value={form.pincode} onChange={(e) => updateField('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('checkout_delivery_date')} error={errors.deliveryDate}>
              <input type="date" className="input-field" min={minDate} max={maxDate} value={form.deliveryDate} onChange={(e) => updateField('deliveryDate', e.target.value)} />
            </Field>
            <Field label={t('checkout_delivery_time')} error={errors.deliveryTime}>
              <select className="input-field" value={form.deliveryTime} onChange={(e) => updateField('deliveryTime', e.target.value)}>
                {DELIVERY_TIME_SLOTS.map((slot) => {
                  const ok = isSlotAvailable(slot, form.deliveryDate, now)
                  return <option key={slot} value={slot} disabled={!ok}>{ok ? slot : `${slot} (${t('checkout_slot_passed')})`}</option>
                })}
              </select>
            </Field>
          </div>
          {!todayHasSlot && <p className="text-xs text-amber-700 font-semibold -mt-2">{t('checkout_today_full')}</p>}

          <Field label={t('checkout_extra_notes')}>
            <textarea className="input-field" rows={2} value={form.notes} onChange={(e) => updateField('notes', e.target.value)} placeholder={t('checkout_notes_placeholder')} />
          </Field>
        </div>

        <div className="card p-4 mt-5">
          <h3 className="font-bold text-gray-700 text-sm mb-2">{t('checkout_coupon')}</h3>
          <div className="flex gap-2">
            <input className="input-field flex-1" value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder={t('checkout_coupon_placeholder')} />
            <button onClick={applyCoupon} className="btn-outline px-4 py-0">{t('checkout_apply')}</button>
          </div>
          {couponMsg && <p className={`text-xs mt-2 font-semibold ${discount > 0 ? 'text-kisan' : 'text-red-500'}`}>{couponMsg}</p>}
        </div>

        <div className="card p-4 mt-4">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>{t('cart_subtotal')}</span>
            <span className="font-semibold">{formatRupee(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>{t('cart_delivery_fee')}</span>
            <span className="font-semibold">{deliveryFee === 0 ? t('cart_free') : formatRupee(deliveryFee)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm text-kisan mb-2">
              <span>{t('checkout_discount')}</span>
              <span className="font-semibold">−{formatRupee(discount)}</span>
            </div>
          )}
          <div className="border-t border-dashed border-gray-200 mt-2 pt-2 flex justify-between font-extrabold text-gray-800">
            <span>{t('checkout_total_amount')}</span>
            <span className="text-kisan">{formatRupee(total)}</span>
          </div>
        </div>

        {settings.cod_enabled ? (
          <div className="card p-4 mt-4">
            <h3 className="font-bold text-gray-700 text-sm mb-3">{t('checkout_payment_method')}</h3>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label={t('checkout_payment_method')}>
              <MethodOption
                checked={method === PAYMENT_ONLINE}
                disabled={submitting}
                onSelect={() => setPayMethod(PAYMENT_ONLINE)}
                icon="💳"
                title={t('checkout_method_online')}
                desc={t('checkout_method_online_desc')}
              />
              <MethodOption
                checked={method === PAYMENT_COD}
                disabled={submitting || !cod.available}
                onSelect={() => setPayMethod(PAYMENT_COD)}
                icon="💵"
                title={t('checkout_method_cod')}
                desc={t('checkout_method_cod_desc')}
              />
            </div>
            {cod.reason === 'limit' && (
              <p className="text-xs text-orange-600 font-semibold mt-2">{t('checkout_cod_limit').replace('{max}', formatRupee(cod.limit))}</p>
            )}
          </div>
        ) : (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold rounded-xl px-4 py-3 mt-4 flex items-center gap-2">
            <span>🔒</span>
            <span>{t('checkout_online_only')}</span>
          </div>
        )}

        {paymentError && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm font-semibold rounded-xl px-4 py-3 mt-3">
            ⚠️ {paymentError}
          </div>
        )}
      </div>

      <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-200 p-4 safe-bottom">
        <button onClick={handlePayNow} disabled={submitting} className="btn-primary w-full">
          {submitting
            ? t('checkout_processing')
            : method === PAYMENT_COD
            ? `${t('checkout_cod_button')} — ${formatRupee(total)}`
            : `${formatRupee(total)} ${t('checkout_pay_button')}`}
        </button>
      </div>
    </div>
  )
}

function MethodOption({ checked, disabled, onSelect, icon, title, desc }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border-2 p-3 min-h-[56px] ${
        checked ? 'border-kisan bg-kisan/5' : 'border-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <input type="radio" name="payMethod" className="mt-1 w-4 h-4 accent-green-700" checked={checked} disabled={disabled} onChange={onSelect} />
      <span className="text-xl leading-none mt-0.5">{icon}</span>
      <span>
        <span className="block font-bold text-sm text-gray-800">{title}</span>
        <span className="block text-xs text-gray-500">{desc}</span>
      </span>
    </label>
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
