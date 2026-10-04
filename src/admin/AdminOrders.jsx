import { lazy, Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext'
import OrderProfit from '../pricing/ui/OrderProfit'
import { supabase } from '../supabaseClient'
import { formatRupee, formatDate, ORDER_STAGES, stageOf, sortOrders } from '../utils/format'
import { isCod, isCodOnline, isPaid, paymentText } from '../utils/paymentMethods'
import { buildCustomerUpdateText, buildCustomerWhatsAppLink, customerWhatsAppNumber } from '../utils/whatsapp'
import { ListPageSkeleton } from '../components/Skeleton'
import CancelOrderModal from './CancelOrderModal'
// लेबल-प्रिंट का भारी हिस्सा (QR लाइब्रेरी सहित) सिर्फ़ तब डाउनलोड होता है जब एडमिन प्रिंट खोले
const LabelPrintDialog = lazy(() => import('../labels/LabelPrintDialog'))
import { S, nextAction, canCancel, isFinal, refundRequired, describeStatusError, STALE_MESSAGE } from '../utils/orderFlow'

const KINDS = ['सभी', 'AI सहायक', 'COD']

export default function AdminOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [params] = useSearchParams()
  const [kind, setKind] = useState('सभी')
  const initialStage = ORDER_STAGES.some((st) => st.key === params.get('stage')) ? params.get('stage') : 'all'
  const [stage, setStage] = useState(initialStage)
  const [waOrder, setWaOrder] = useState(null) // WhatsApp संदेश-पैनल जिस ऑर्डर का खुला है
  const [waText, setWaText] = useState('')
  const [limit, setLimit] = useState(200)
  const [collapsed, setCollapsed] = useState({ done: true, cancelled: true })
  const [expanded, setExpanded] = useState(null)
  const { isOwner } = useAdminAuth()
  const [busyId, setBusyId] = useState(null)      // जिस ऑर्डर पर अभी बदलाव चल रहा है (double-tap रोकने के लिए)
  const [notice, setNotice] = useState(null)      // {type:'error'|'info', text}
  const [cancelFor, setCancelFor] = useState(null) // रद्द-पुष्टि मॉडल वाला ऑर्डर
  const [cancelError, setCancelError] = useState('')
  const [selected, setSelected] = useState(() => new Set()) // लेबल छापने के लिए चुने ऑर्डर (id)
  const [printOrders, setPrintOrders] = useState(null)       // खुले लेबल-डायलॉग के ऑर्डर

  useEffect(() => {
    loadOrders()
  }, [limit])

  async function loadOrders({ silent = false } = {}) {
    if (!silent) setLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
      .limit(limit) // हज़ारों ऑर्डर एक साथ न खिंचें
    if (!error) setOrders(data || [])
    else if (silent) setNotice({ type: 'error', text: 'ताज़ा ऑर्डर लोड नहीं हो सके। पेज रिफ्रेश करें।' })
    setLoading(false)
  }

  // सारे स्थिति-बदलाव एक ही रास्ते से: डेटाबेस का admin_set_order_status RPC (ताला + stale-जाँच + वैध-बदलाव की जाँच)।
  // स्क्रीन पर स्थिति तभी बदलती है जब डेटाबेस सफल लौटाए — पहले से "आशावादी" बदलाव नहीं।
  async function changeStatus(order, newStatus, reason = null) {
    if (busyId) return { ok: false }
    setBusyId(order.id)
    setNotice(null)
    try {
      const { data, error } = await supabase.rpc('admin_set_order_status', {
        p_order_id: order.id,
        p_expected_status: order.order_status, // जो स्थिति स्क्रीन पर दिख रही थी
        p_new_status: newStatus,
        p_reason: reason,
      })
      if (error) throw error
      if (data && data.ok === false) {
        if (data.error === 'STALE') {
          setNotice({ type: 'info', text: STALE_MESSAGE })
          await loadOrders({ silent: true })
          return { ok: false, stale: true }
        }
        throw new Error(data.error || 'FAILED')
      }
      await loadOrders({ silent: true })
      return { ok: true }
    } catch (err) {
      const text = describeStatusError(err)
      setNotice({ type: 'error', text })
      // INVALID_TRANSITION आम तौर पर तब आता है जब स्क्रीन पुरानी हो — नई स्थिति दिखाएँ
      if (/INVALID_TRANSITION/.test(String(err?.message || ''))) await loadOrders({ silent: true })
      return { ok: false, error: text }
    } finally {
      setBusyId(null)
    }
  }

  async function advance(order) {
    const next = nextAction(order.order_status)
    if (!next) return
    // ऑनलाइन ऑर्डर का पैसा नहीं आया हो तो आगे बढ़ाने से पहले पूछें (COD में पैसा डिलीवरी पर आता है)
    if (!isCod(order) && !isPaid(order) && next.status !== S.ACCEPTED) {
      const state = order.payment_status === 'असफल' ? 'असफल' : 'बाकी'
      if (!confirm(`इस ऑर्डर का ऑनलाइन भुगतान अभी ${state} है।\nफिर भी स्थिति "${next.status}" करें?`)) return
    }
    // डिलीवरी पूरी होना अंतिम (लॉक) है — एक बार पूछ लें
    if (next.status === S.DELIVERED && !confirm(`ऑर्डर ${order.order_number} को "डिलीवरी पूरी हुई" करें?\nइसके बाद यह ऑर्डर बदला नहीं जा सकेगा।`)) return
    await changeStatus(order, next.status)
  }

  function openCancel(order) {
    setCancelError('')
    setCancelFor(order)
  }

  async function confirmCancel(reason) {
    if (!cancelFor || !reason) return
    const res = await changeStatus(cancelFor, S.CANCELLED, reason)
    if (res.ok || res.stale) {
      setCancelFor(null)
    } else {
      setCancelError(res.error || 'ऑर्डर रद्द नहीं हो सका। दोबारा कोशिश करें।')
    }
  }

  function openWa(o) {
    if (waOrder === o.id) { setWaOrder(null); return }
    setWaText(buildCustomerUpdateText(o, window.location.origin))
    setWaOrder(o.id)
  }

  const byKind = kind === 'AI सहायक'
    ? orders.filter((o) => o.order_source === 'AI सहायक')
    : kind === 'COD'
    ? orders.filter((o) => isCod(o))
    : orders

  const toggleSelect = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const selectedOrders = () =>
    orders.filter((o) => selected.has(o.id)).sort((a, b) => String(a.order_number).localeCompare(String(b.order_number)))
  const visibleIds = byKind.filter((o) => stage === 'all' || stageOf(o).key === stage).map((o) => o.id)

  const stageCount = (key) => byKind.filter((o) => stageOf(o).key === key).length
  const visibleStages = ORDER_STAGES.filter((st) => stage === 'all' || stage === st.key)
  const groups = visibleStages
    .map((st) => ({ st, list: sortOrders(byKind.filter((o) => stageOf(o).key === st.key)) }))
    .filter((g) => g.list.length > 0)

  const chip = (active) =>
    `whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border-2 ${
      active ? 'bg-kisan text-white border-kisan' : 'bg-white text-gray-500 border-gray-200'
    }`

  if (loading) return <ListPageSkeleton chips={2} count={4} />

  return (
    <div>
      <h1 className="font-extrabold text-xl text-gray-800 mb-5">ऑर्डर प्रबंधन</h1>

      {notice && (
        <div
          role="alert"
          className={`mb-4 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${
            notice.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-200 text-blue-700'
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="text-xs font-bold opacity-70 shrink-0">बंद करें</button>
        </div>
      )}

      {cancelFor && (
        <CancelOrderModal
          order={cancelFor}
          busy={busyId === cancelFor.id}
          error={cancelError}
          onClose={() => setCancelFor(null)}
          onConfirm={confirmCancel}
        />
      )}

      {selected.size > 0 && (
        <div className="sticky top-2 z-30 mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-white border-2 border-kisan shadow-md px-3 py-2">
          <span className="text-sm font-bold text-gray-700">{selected.size} ऑर्डर चुने</span>
          <button type="button" onClick={() => setSelected(new Set(visibleIds))} className="text-xs font-bold text-gray-600 underline min-h-[36px] px-1">सभी दिख रहे चुनें</button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-xs font-bold text-gray-600 underline min-h-[36px] px-1">चयन हटाएँ</button>
          <button
            type="button"
            onClick={() => setPrintOrders(selectedOrders())}
            className="ml-auto min-h-[44px] px-4 rounded-xl bg-kisan text-white text-sm font-bold active:scale-95 transition-transform"
          >
            🖨 चुने हुए लेबल प्रिंट करें (Print Selected Labels)
          </button>
        </div>
      )}

      {printOrders && (
        <Suspense fallback={null}>
          <LabelPrintDialog
            orders={printOrders}
            onClose={() => setPrintOrders(null)}
            onPrinted={() => loadOrders({ silent: true })}
          />
        </Suspense>
      )}

      <div className="mb-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-bold text-gray-400 shrink-0 w-16">प्रकार</span>
          {KINDS.map((k) => (
            <button key={k} onClick={() => setKind(k)} className={chip(kind === k)}>{k === 'AI सहायक' ? '🤖 ' : k === 'COD' ? '💵 ' : ''}{k}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-bold text-gray-400 shrink-0 w-16">स्थिति</span>
          <button onClick={() => setStage('all')} className={chip(stage === 'all')}>सभी ({byKind.length})</button>
          {ORDER_STAGES.map((st) => (
            <button key={st.key} onClick={() => setStage(st.key)} className={chip(stage === st.key)}>
              {st.icon} {st.label} ({stageCount(st.key)})
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {groups.map(({ st, list }) => {
          const isCollapsed = stage === 'all' && collapsed[st.key]
          return (
          <section key={st.key}>
            <button
              onClick={() => setCollapsed((c) => ({ ...c, [st.key]: !c[st.key] }))}
              className={`w-full flex items-center justify-between rounded-xl border px-4 py-2 mb-3 ${st.tone}`}
            >
              <span className="font-extrabold text-sm">{st.icon} {st.label} <span className="font-bold opacity-70">({list.length})</span></span>
              {stage === 'all' && <span className="text-xs font-bold">{isCollapsed ? 'दिखाएँ ▾' : 'छिपाएँ ▴'}</span>}
            </button>
            {!isCollapsed && (
            <div className="flex flex-col gap-3">
        {list.map((o) => (
          <div key={o.id} className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex justify-between items-start cursor-pointer" onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
              <label
                className="shrink-0 -ml-2 -mt-2 mr-1 w-11 h-11 flex items-center justify-center cursor-pointer"
                onClick={(e) => e.stopPropagation()}
                aria-label={`${o.order_number} लेबल के लिए चुनें`}
              >
                <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} className="w-5 h-5 accent-green-700" />
              </label>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-800 text-sm break-all">{o.order_number}</p>
                <p className="text-xs text-gray-500 break-words">{o.customer_name} • {o.customer_phone}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(o.created_at)}</p>
                {o.order_source && o.order_source !== 'वेबसाइट' && (
                  <span className="inline-block mt-1 text-[10px] font-bold whitespace-nowrap bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                    🤖 {o.order_source}
                  </span>
                )}
                {isCod(o) && (
                  <span className="inline-block mt-1 ml-1 text-[10px] font-bold whitespace-nowrap bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                    {isCodOnline(o) ? '📲 डिलीवरी पर UPI' : '💵 कैश ऑन डिलीवरी'}
                  </span>
                )}
              </div>
              <div className="text-right shrink-0 pl-2">
                <p className="font-extrabold text-gray-800 whitespace-nowrap">{formatRupee(o.total_amount)}</p>
              </div>
            </div>
            <p className={`mt-2 text-xs font-bold ${isPaid(o) ? 'text-kisan' : 'text-orange-500'}`}>
              भुगतान: {paymentText(o)}
            </p>

            {expanded === o.id && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2">{o.full_address}{o.mohalla ? `, ${o.mohalla}` : ''}, {o.city} - {o.pincode}</p>
                <p className="text-xs text-gray-500 mb-2">डिलीवरी: {o.delivery_date} • {o.delivery_time_slot}</p>
                {o.delivery_pin && (
                  <p className="text-xs text-gray-500 mb-2">डिलीवरी पिन: <span className="font-mono font-bold text-gray-700">{o.delivery_pin}</span></p>
                )}

                {o.latitude && o.longitude ? (
                  <div className="mb-3">
                    <iframe
                      title={`map-${o.id}`}
                      className="w-full h-48 rounded-xl border border-gray-200"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${o.longitude - 0.006}%2C${o.latitude - 0.006}%2C${o.longitude + 0.006}%2C${o.latitude + 0.006}&layer=mapnik&marker=${o.latitude}%2C${o.longitude}`}
                      loading="lazy"
                    />
                    <a
                      href={`https://www.google.com/maps?q=${o.latitude},${o.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 mt-2"
                    >
                      🗺️ Google Maps में पूरा मार्ग देखें
                    </a>
                  </div>
                ) : (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      `${o.full_address}, ${o.mohalla || ''}, ${o.city} - ${o.pincode}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 mb-3"
                  >
                    🗺️ पते से मानचित्र पर खोजें (GPS लोकेशन उपलब्ध नहीं थी)
                  </a>
                )}

                <div className="flex flex-col gap-1 mb-3">
                  {o.order_items.map((i) => (
                    <div key={i.id} className="flex justify-between text-xs text-gray-600">
                      <span>{i.vegetable_name} x {i.quantity} {i.unit}{i.seller_name ? ` (${i.seller_name})` : ''}</span>
                      <span>{formatRupee(i.item_total)}</span>
                    </div>
                  ))}
                </div>
                {isOwner && <OrderProfit orderId={o.id} />}
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={() => setPrintOrders([o])} className="flex-1 min-h-[44px] border-2 border-gray-300 text-gray-700 text-sm font-bold rounded-xl active:scale-95 transition-transform">
                    👁 लेबल प्रीव्यू (Preview Label)
                  </button>
                  <button type="button" onClick={() => setPrintOrders([o])} className="flex-1 min-h-[44px] bg-kisan text-white text-sm font-bold rounded-xl active:scale-95 transition-transform">
                    🖨 लेबल प्रिंट (Print Label)
                  </button>
                </div>
              </div>
            )}

            <div className="mt-3">
              <StatusBadge status={o.order_status} />
              {refundRequired(o) && (
                <p className="mt-2 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  ⚠️ रिफंड ज़रूरी — ग्राहक का ऑनलाइन भुगतान ({formatRupee(o.total_amount)}) अभी वापस नहीं हुआ। भुगतान: सफल
                </p>
              )}
              {o.order_status === S.CANCELLED && o.cancel_reason && (
                <p className="mt-2 text-xs text-gray-500">कारण: {o.cancel_reason}</p>
              )}
              <div className="flex gap-1.5 mt-2 items-stretch">
                {!isFinal(o.order_status) && nextAction(o.order_status) && (
                  <button
                    onClick={() => advance(o)}
                    disabled={busyId === o.id}
                    className="flex-1 min-w-0 min-h-[44px] bg-kisan text-white text-[13px] leading-tight font-bold px-2 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                  >
                    {busyId === o.id ? 'कृपया रुकें...' : nextAction(o.order_status).label}
                  </button>
                )}
                {!isFinal(o.order_status) && canCancel(o.order_status) && (
                  <button
                    onClick={() => openCancel(o)}
                    disabled={busyId === o.id}
                    className="shrink-0 min-h-[44px] px-2.5 border-2 border-gray-300 text-gray-600 text-xs font-bold rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                  >
                    रद्द
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPrintOrders([o])}
                  aria-label="लेबल प्रिंट"
                  title="लेबल प्रिंट"
                  className="ml-auto shrink-0 w-10 min-h-[44px] flex items-center justify-center border-2 border-gray-300 text-gray-700 text-lg rounded-xl active:scale-95 transition-transform"
                >
                  🖨
                </button>
                <button
                  onClick={() => openWa(o)}
                  disabled={customerWhatsAppNumber(o.customer_phone).length < 10}
                  aria-label="ग्राहक को WhatsApp अपडेट भेजें"
                  title="ग्राहक को WhatsApp अपडेट भेजें"
                  className="shrink-0 w-10 min-h-[44px] flex items-center justify-center bg-[#25D366] text-white text-lg rounded-xl active:scale-95 transition-transform disabled:opacity-40"
                >
                  📲
                </button>
              </div>
            </div>

            <div className="mt-3">
              {waOrder === o.id && (
                <div className="mt-2 border border-green-200 bg-green-50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-gray-600 mb-1">संदेश (भेजने से पहले बदल सकते हैं) — {o.customer_name} • {o.customer_phone}</p>
                  <textarea
                    value={waText}
                    onChange={(e) => setWaText(e.target.value)}
                    rows={8}
                    className="w-full text-sm border border-gray-200 rounded-lg p-2 bg-white focus:outline-none focus:border-kisan"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setWaText(buildCustomerUpdateText(o, window.location.origin))}
                      className="flex-1 text-xs font-bold text-gray-600 border border-gray-300 rounded-lg py-2"
                    >
                      स्थिति के हिसाब से दोबारा बनाएँ
                    </button>
                    <a
                      href={buildCustomerWhatsAppLink(o.customer_phone, waText)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setWaOrder(null)}
                      className="flex-1 text-center text-xs font-bold bg-[#25D366] text-white rounded-lg py-2"
                    >
                      WhatsApp खोलें
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
            </div>
            )}
          </section>
          )
        })}
        {orders.length >= limit && (
          <button onClick={() => setLimit((l) => l + 200)} className="btn-outline w-full">
            पुराने ऑर्डर लोड करें (अभी सबसे नए {limit} दिख रहे हैं)
          </button>
        )}
        {groups.length === 0 && <p className="text-gray-400 text-center py-10">इस चयन में कोई ऑर्डर नहीं</p>}
      </div>
    </div>
  )
}

// स्थिति का बैज — अंतिम स्थितियों पर 🔒 (कोई बदलाव-नियंत्रण नहीं)
const BADGE_TONE = {
  [S.NEW]: 'bg-blue-50 text-blue-700 border-blue-200',
  [S.PAID]: 'bg-blue-50 text-blue-700 border-blue-200',
  [S.ACCEPTED]: 'bg-amber-50 text-amber-700 border-amber-200',
  [S.PREPARING]: 'bg-amber-50 text-amber-700 border-amber-200',
  [S.OUT]: 'bg-purple-50 text-purple-700 border-purple-200',
  [S.DELIVERED]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  [S.CANCELLED]: 'bg-red-50 text-red-700 border-red-200',
}
function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-extrabold px-3 py-1 rounded-full border ${BADGE_TONE[status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
      {status === S.DELIVERED && '✓ '}
      {status === S.CANCELLED && '✕ '}
      {status}
      {isFinal(status) && ' 🔒'}
    </span>
  )
}
