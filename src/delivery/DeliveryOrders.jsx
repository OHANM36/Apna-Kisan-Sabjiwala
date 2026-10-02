import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useDeliveryAuth } from '../context/DeliveryAuthContext'
import { formatRupee } from '../utils/format'
import { isCod, isCodOnline, isPaid } from '../utils/paymentMethods'
import { useSettings } from '../context/SettingsContext'
import UpiQr, { buildUpiLink } from '../components/UpiQr'
import { Bone, SkeletonWrap } from '../components/Skeleton'

const TABS = [
  { key: 'available', label: 'उपलब्ध' },
  { key: 'mine', label: 'मेरी डिलीवरी' },
  { key: 'done', label: 'पूरी हुई' },
]

const EMPTY_TEXT = {
  available: 'अभी कोई नया ऑर्डर उपलब्ध नहीं है',
  mine: 'फ़िलहाल आपके पास कोई डिलीवरी नहीं है',
  done: 'अभी तक कोई डिलीवरी पूरी नहीं हुई',
}

// ---------- छोटे सहायक (सिर्फ़ दिखाने के लिए, कोई बिज़नेस-लॉजिक नहीं) ----------
function shortNumber(n) {
  const m = String(n ?? '').match(/(\d+)\s*$/)
  return m ? `#${m[1].slice(-4).padStart(4, '0')}` : String(n ?? '')
}

function shortDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('hi-IN', { day: 'numeric', month: 'long' })
}

function mapsHref(o) {
  return o.latitude && o.longitude
    ? `https://www.google.com/maps?q=${o.latitude},${o.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${o.full_address}, ${o.mohalla || ''}, ${o.city} - ${o.pincode}`
      )}`
}

function Icon({ d, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}
const PHONE = ['M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z']
const NAV = ['M3 11l19-9-9 19-2-8-8-2z']
const CHECK = ['M20 6L9 17l-5-5']
const QR = ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h3v3h-3z', 'M20 14v7h-3', 'M14 20h0']

// ---------- भुगतान पिल: 1–2 सेकंड में समझ आए ----------
function PaymentPill({ o }) {
  if (isCod(o) && !isPaid(o)) {
    const upi = isCodOnline(o)
    return (
      <div
        className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 border"
        style={upi
          ? { background: '#fffbeb', borderColor: '#fde68a' }
          : { background: '#f7fee7', borderColor: '#d9f99d' }}
      >
        <p className="font-bold text-[15px]" style={{ color: upi ? '#92400e' : '#3f6212' }}>
          {upi ? '💳 UPI' : '💵 CASH'}
        </p>
        <p className="font-bold text-[15px] text-gray-900">{formatRupee(o.total_amount)} लेना है</p>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 rounded-2xl px-4 py-3 border" style={{ background: '#ecfdf3', borderColor: '#bbf7d0' }}>
      <span className="text-green-700"><Icon d={CHECK} size={16} /></span>
      <p className="font-semibold text-[14px] text-green-800">
        {isCod(o) ? 'भुगतान मिल चुका है' : 'ऑनलाइन भुगतान हो चुका — कुछ लेना नहीं'}
      </p>
    </div>
  )
}

// ---------- ऑर्डर कार्ड ----------
function OrderCard({ o, tab, busy, expanded, onToggle, onClaim, onDeliver, onQr }) {
  const needsCollect = isCod(o) && !isPaid(o)
  const upi = isCodOnline(o)
  const chip = tab === 'available'
    ? { text: 'उपलब्ध', bg: '#eff6ff', fg: '#1d4ed8' }
    : { text: '● रास्ते में', bg: '#fff7ed', fg: '#c2410c' }

  return (
    <article className="dp-card">
      {/* हेडर */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-[16px] leading-tight text-gray-900">{shortNumber(o.order_number)}</p>
          <p className="text-[13px] text-gray-500 mt-1">{shortDate(o.created_at)} • {o.delivery_time_slot}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-[20px] leading-tight text-gray-900">{formatRupee(o.total_amount)}</p>
          <span className="dp-chip mt-1" style={{ background: chip.bg, color: chip.fg }}>{chip.text}</span>
        </div>
      </div>

      {/* ग्राहक */}
      <div className="mt-3 text-[14px] text-gray-800 flex flex-col gap-0.5">
        <p className="font-semibold">👤 {o.customer_name}</p>
        <a href={`tel:${o.customer_phone}`} className="text-gray-600 inline-flex items-center min-h-[32px] w-fit">📞 {o.customer_phone}</a>
      </div>

      {/* भुगतान */}
      <div className="mt-3"><PaymentPill o={o} /></div>

      {/* कॉल + मार्ग */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <a href={`tel:${o.customer_phone}`} className="dp-btn dp-btn-outline"><Icon d={PHONE} /> कॉल करें</a>
        <a href={mapsHref(o)} target="_blank" rel="noreferrer" className="dp-btn dp-btn-outline"><Icon d={NAV} /> मार्ग देखें</a>
      </div>

      {/* विवरण (पता + सामान) */}
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="w-full min-h-[44px] mt-1 text-[13px] font-semibold text-gray-500 flex items-center justify-center gap-1">
        {expanded ? 'विवरण छुपाएँ ▲' : 'पता और सामान देखें ▼'}
      </button>
      {expanded && (
        <div className="pt-3 border-t border-gray-100 text-[13px] text-gray-600">
          <p className="mb-2">{o.full_address}{o.mohalla ? `, ${o.mohalla}` : ''}, {o.city} - {o.pincode}</p>
          <div className="flex flex-col gap-1">
            {o.order_items.map((i) => (
              <div key={i.id} className="flex justify-between gap-3">
                <span>{i.vegetable_name} × {i.quantity} {i.unit}</span>
                <span className="shrink-0">{formatRupee(i.item_total)}</span>
              </div>
            ))}
          </div>
          {o.extra_notes && <p className="mt-2">📝 {o.extra_notes}</p>}
          <p className="mt-2 text-[12px] text-gray-400 break-all">ऑर्डर नं.: {o.order_number}</p>
        </div>
      )}

      {/* UPI: QR बटन (QR बॉटम-शीट में खुलता है) */}
      {tab === 'mine' && needsCollect && upi && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-[14px] font-semibold text-gray-800 mb-2">{formatRupee(o.total_amount)} UPI से लेना है</p>
          <button type="button" onClick={onQr} className="dp-btn dp-btn-amber"><Icon d={QR} /> {formatRupee(o.total_amount)} का QR दिखाएँ</button>
          <p className="text-[13px] text-gray-500 mt-2">पेमेंट मिलने के बाद ही डिलीवरी कन्फर्म करें।</p>
        </div>
      )}
      {/* कैश */}
      {tab === 'mine' && needsCollect && !upi && (
        <p className="mt-3 text-[13px] text-gray-500">💵 ग्राहक से {formatRupee(o.total_amount)} लें, फिर डिलीवरी पूरी करें।</p>
      )}

      {/* मुख्य CTA */}
      {tab === 'available' && (
        <button type="button" onClick={onClaim} disabled={busy} className="dp-btn dp-btn-primary mt-3">
          {busy ? 'भेजा जा रहा है…' : '🚴 मैं डिलीवर करूंगा'}
        </button>
      )}
      {tab === 'mine' && (
        <button type="button" onClick={onDeliver} disabled={busy} className="dp-btn dp-btn-primary mt-3">
          {busy ? 'सेव हो रहा है…' : <><Icon d={CHECK} /> डिलीवरी पूरी करें</>}
        </button>
      )}
    </article>
  )
}

// ---------- पूरी हुई: सरल कार्ड ----------
function DoneCard({ o }) {
  return (
    <article className="dp-card flex items-center justify-between gap-3 !py-3">
      <div className="min-w-0">
        <p className="font-bold text-[16px] text-gray-900">{shortNumber(o.order_number)}</p>
        <p className="text-[14px] text-gray-700 truncate">{o.customer_name}</p>
        <p className="text-[13px] font-semibold text-green-700 mt-0.5">✓ डिलीवर हुआ • {shortDate(o.created_at)}</p>
      </div>
      <p className="font-bold text-[18px] text-gray-900 shrink-0">{formatRupee(o.total_amount)}</p>
    </article>
  )
}

function CardsSkeleton() {
  return (
    <SkeletonWrap>
      <div className="flex flex-col gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="dp-card">
            <div className="flex justify-between"><div><Bone className="h-4 w-16 mb-2" /><Bone className="h-3 w-32" /></div><Bone className="h-6 w-20" /></div>
            <Bone className="h-4 w-40 mt-4" />
            <Bone className="h-12 w-full mt-4 rounded-2xl" />
            <div className="grid grid-cols-2 gap-3 mt-3"><Bone className="h-12 rounded-xl" /><Bone className="h-12 rounded-xl" /></div>
            <Bone className="h-[52px] w-full mt-4 rounded-2xl" />
          </div>
        ))}
      </div>
    </SkeletonWrap>
  )
}

export default function DeliveryOrders() {
  const { deliveryBoy, token, logout } = useDeliveryAuth()
  const [tab, setTab] = useState('available')
  const [data, setData] = useState({ available: [], mine: [], done: [] })
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const busyRef = useRef(false) // डबल-टैप / दोहरा API अनुरोध रोकने के लिए तुरंत का ताला
  const [expanded, setExpanded] = useState(null)
  const [confirmOrder, setConfirmOrder] = useState(null)
  const [confirmPin, setConfirmPin] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [paymentTicked, setPaymentTicked] = useState(false)
  const [toast, setToast] = useState(null)
  const [qrOrder, setQrOrder] = useState(null)
  const { settings } = useSettings()

  const showToast = useCallback((message, type = 'ok') => {
    setToast({ message, type, id: Date.now() })
  }, [])
  useEffect(() => {
    if (!toast) return undefined
    const id = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(id)
  }, [toast])

  // वही RPC (delivery_orders), तीनों टैब एक साथ — ताकि ऊपर का सारांश और टैब की गिनती सही रहे
  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const results = await Promise.all(
      TABS.map((t) => supabase.rpc('delivery_orders', { p_token: token, p_tab: t.key }))
    )
    if (results.some((r) => r.error && /UNAUTHORIZED/.test(r.error.message || ''))) {
      logout() // session खत्म/निष्क्रिय → लॉगिन पर वापस
      return
    }
    setData((prev) => {
      const next = { ...prev }
      TABS.forEach((t, i) => {
        const r = results[i]
        if (!r.error) next[t.key] = Array.isArray(r.data) ? r.data : []
      })
      return next
    })
    setLoading(false)
  }, [token, logout])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // realtime की जगह हर 20 सेकंड polling (टैब दिख रहा हो तभी)
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) loadOrders(true)
    }, 20000)
    return () => clearInterval(id)
  }, [loadOrders])

  async function claimOrder(order) {
    if (busyRef.current) return
    busyRef.current = true
    setBusyId(order.id)
    const { data: res, error } = await supabase.rpc('delivery_claim_order', { p_token: token, p_order_id: order.id })
    busyRef.current = false
    setBusyId(null)
    if (error || !res?.ok) {
      showToast(res?.error === 'TAKEN' ? 'यह ऑर्डर किसी और डिलीवरी बॉय ने ले लिया है।' : 'ऑर्डर नहीं मिल सका। दोबारा कोशिश करें।', 'err')
    } else {
      showToast('ऑर्डर आपकी डिलीवरी में जुड़ गया ✓')
    }
    loadOrders(true)
  }

  function openConfirm(order) {
    setConfirmOrder(order)
    setConfirmPin('')
    setConfirmError('')
    setPaymentTicked(false)
  }

  function closeConfirm() {
    if (busyRef.current) return
    setConfirmOrder(null)
    setConfirmPin('')
    setConfirmError('')
    setPaymentTicked(false)
  }

  const confirmNeedsPayment = !!confirmOrder && isCod(confirmOrder) && !isPaid(confirmOrder)

  async function submitConfirmPin(e) {
    e.preventDefault()
    if (!confirmOrder || busyRef.current) return
    if (confirmNeedsPayment && !paymentTicked) return // UI में भी: पैसा लिए बिना आगे नहीं (सर्वर के नियम अलग से लागू हैं)
    busyRef.current = true
    setBusyId(confirmOrder.id)
    // PIN की जाँच सर्वर पर होती है (5 गलत कोशिश पर लॉक); PIN इस डिवाइस को कभी नहीं भेजा जाता
    const { data: res, error } = await supabase.rpc('delivery_confirm', { p_token: token, p_order_id: confirmOrder.id, p_pin: confirmPin.trim() })
    busyRef.current = false
    setBusyId(null)
    if (error || !res?.ok) {
      setConfirmError(
        res?.error === 'LOCKED' ? 'बहुत गलत कोशिशें। एडमिन से संपर्क करें।'
        : res?.error === 'WRONG_PIN' ? 'गलत पिन! ग्राहक से सही 4 अंकों का पिन पूछें।'
        : 'कन्फर्म नहीं हो सका। दोबारा कोशिश करें।'
      )
      return
    }
    setConfirmOrder(null)
    setConfirmPin('')
    setPaymentTicked(false)
    showToast('डिलीवरी पूरी हुई ✓')
    loadOrders(true)
  }

  // ऊपर का सारांश
  const stats = useMemo(() => {
    const collect = data.mine
      .filter((o) => isCod(o) && !isPaid(o))
      .reduce((s, o) => s + Number(o.total_amount || 0), 0)
    return { active: data.mine.length, done: data.done.length, collect }
  }, [data])

  const list = data[tab]
  const firstName = (deliveryBoy.full_name || '').split(' ')[0]

  return (
    <div>
      <div className="dp-wrap pt-4">
        <h1 className="text-[22px] font-bold leading-tight text-gray-900">नमस्ते, {firstName} 👋</h1>
        <p className="text-[14px] text-gray-500 mt-1">आज की डिलीवरी</p>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="dp-stat"><p className="text-[18px] font-bold leading-tight text-gray-900">{stats.active}</p><p className="text-[12px] text-gray-500 mt-0.5">बाकी</p></div>
          <div className="dp-stat"><p className="text-[18px] font-bold leading-tight text-gray-900">{stats.done}</p><p className="text-[12px] text-gray-500 mt-0.5">पूरी हुई</p></div>
          <div className="dp-stat" style={{ background: '#fffbeb', borderColor: '#fde68a' }}><p className="text-[18px] font-bold leading-tight" style={{ color: '#92400e' }}>{formatRupee(stats.collect)}</p><p className="text-[12px] mt-0.5" style={{ color: '#92400e' }}>लेना है</p></div>
        </div>
      </div>

      {/* चिपका हुआ (sticky) फ़िल्टर */}
      <div className="dp-tabs-bar mt-2">
        <div className="dp-wrap">
          <div className="dp-seg" role="tablist" aria-label="ऑर्डर फ़िल्टर">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
              >
                {t.label}{t.key !== 'done' ? ` (${data[t.key].length})` : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dp-wrap pb-8">
        {loading ? (
          <CardsSkeleton />
        ) : list.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3" aria-hidden="true">{tab === 'done' ? '✅' : '📦'}</p>
            <p className="text-[15px] text-gray-500">{EMPTY_TEXT[tab]}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {list.map((o) =>
              tab === 'done' ? (
                <DoneCard key={o.id} o={o} />
              ) : (
                <OrderCard
                  key={o.id}
                  o={o}
                  tab={tab}
                  busy={busyId === o.id}
                  expanded={expanded === o.id}
                  onToggle={() => setExpanded(expanded === o.id ? null : o.id)}
                  onClaim={() => claimOrder(o)}
                  onDeliver={() => openConfirm(o)}
                  onQr={() => setQrOrder(o)}
                />
              )
            )}
          </div>
        )}
      </div>

      {/* QR बॉटम-शीट */}
      {qrOrder && (
        <div className="dp-sheet-back" onClick={() => setQrOrder(null)}>
          <div className="dp-sheet" role="dialog" aria-modal="true" aria-label="UPI QR" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] text-gray-500">{shortNumber(qrOrder.order_number)} • {qrOrder.customer_name}</p>
                <p className="text-[32px] font-bold leading-tight text-gray-900 mt-1">{formatRupee(qrOrder.total_amount)}</p>
              </div>
              <button type="button" onClick={() => setQrOrder(null)} className="dp-iconbtn -mt-2 -mr-2 text-2xl" aria-label="बंद करें">×</button>
            </div>
            <div className="mt-3">
              {settings.shop_upi_id ? (
                <>
                  <UpiQr size={240} link={buildUpiLink({ upiId: settings.shop_upi_id, name: settings.business_name, amount: qrOrder.total_amount, note: qrOrder.order_number })} />
                  <p className="text-center text-[13px] text-gray-500 mt-3">UPI ID: <span className="font-mono font-bold text-gray-700 break-all">{settings.shop_upi_id}</span></p>
                  <p className="text-center text-[13px] text-gray-500 mt-1">ग्राहक किसी भी UPI ऐप से स्कैन करे।</p>
                </>
              ) : (
                <p className="text-[14px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
                  दुकान का UPI ID अभी सेट नहीं है। एडमिन से कहें कि वह एडमिन → भुगतान विकल्प में UPI ID डाले। तब तक ग्राहक से कैश लें।
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button type="button" className="dp-btn dp-btn-outline" onClick={() => setQrOrder(null)}>बंद करें</button>
              <button
                type="button"
                className="dp-btn"
                style={{ background: 'var(--dp-green)', color: '#fff' }}
                onClick={() => { const o = qrOrder; setQrOrder(null); openConfirm(o) }}
              >
                भुगतान मिल गया
              </button>
            </div>
          </div>
        </div>
      )}

      {/* डिलीवरी कन्फर्मेशन (वही सर्वर-जाँच वाला पिन) */}
      {confirmOrder && (
        <div className="dp-sheet-back" onClick={closeConfirm}>
          <form onSubmit={submitConfirmPin} className="dp-sheet" role="dialog" aria-modal="true" aria-label="डिलीवरी कन्फर्म" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-[18px] text-gray-900">डिलीवरी पूरी करें?</h2>
                <p className="text-[13px] text-gray-500 mt-1">{shortNumber(confirmOrder.order_number)} • {confirmOrder.customer_name} • {formatRupee(confirmOrder.total_amount)}</p>
              </div>
              <button type="button" onClick={closeConfirm} className="dp-iconbtn -mt-2 -mr-2 text-2xl" aria-label="बंद करें">×</button>
            </div>

            {confirmNeedsPayment && (
              <label className="flex items-start gap-3 mt-4 rounded-2xl border px-4 py-3 cursor-pointer" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
                <input
                  type="checkbox"
                  checked={paymentTicked}
                  onChange={(e) => setPaymentTicked(e.target.checked)}
                  className="mt-1 w-5 h-5 shrink-0 accent-green-700"
                />
                <span className="text-[14px] font-semibold" style={{ color: '#92400e' }}>
                  {isCodOnline(confirmOrder)
                    ? `मुझे ${formatRupee(confirmOrder.total_amount)} का UPI भुगतान फ़ोन/SMS में दिख गया है (या मैंने कैश ले लिया है)`
                    : `मैंने ग्राहक से ${formatRupee(confirmOrder.total_amount)} कैश ले लिया है`}
                </span>
              </label>
            )}

            <p className="text-[14px] text-gray-700 mt-4 mb-2">ग्राहक से 4 अंकों का डिलीवरी पिन पूछकर डालें।</p>
            <input
              autoFocus
              required
              inputMode="numeric"
              maxLength={4}
              disabled={busyId === confirmOrder.id}
              className="input-field text-center text-2xl font-mono tracking-[0.5em]"
              value={confirmPin}
              onChange={(e) => {
                setConfirmError('')
                setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))
              }}
              placeholder="••••"
            />
            {confirmError && <p className="text-red-600 text-[14px] font-semibold mt-2" role="alert">{confirmError}</p>}

            <div className="grid grid-cols-2 gap-3 mt-4">
              <button type="button" onClick={closeConfirm} disabled={busyId === confirmOrder.id} className="dp-btn" style={{ border: '1.5px solid #e5e7eb', color: '#4b5563' }}>रद्द करें</button>
              <button
                type="submit"
                disabled={confirmPin.length !== 4 || busyId === confirmOrder.id || (confirmNeedsPayment && !paymentTicked)}
                className="dp-btn"
                style={{ background: 'var(--dp-green)', color: '#fff' }}
              >
                {busyId === confirmOrder.id ? 'सेव हो रहा है…' : 'कन्फर्म करें'}
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && (
        <div key={toast.id} role="status" aria-live="polite" className="dp-toast" style={{ background: toast.type === 'err' ? '#b91c1c' : '#166534' }}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
