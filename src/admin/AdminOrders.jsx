import { lazy, Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext'
import OrderProfit from '../pricing/ui/OrderProfit'
import { supabase } from '../supabaseClient'
import { formatRupee, formatDate, ORDER_STAGES, stageOf, sortOrders } from '../utils/format'
import { isCod, isCodOnline, isPaid, paymentText } from '../utils/paymentMethods'
import { buildCustomerUpdateText, buildCustomerWhatsAppLink, customerWhatsAppNumber } from '../utils/whatsapp'
import { OrdersSkeleton } from '../components/Skeleton'
import { useLanguage } from '../context/LanguageContext'
import Icon from './AdminIcons'
import { AdminPageHeader, AdminSearchBar, AdminBottomSheet, AdminStatusBadge, AdminEmptyState, STAGE_SHORT } from './AdminUI'
import CancelOrderModal from './CancelOrderModal'
// लेबल-प्रिंट का भारी हिस्सा (QR लाइब्रेरी सहित) सिर्फ़ तब डाउनलोड होता है जब एडमिन प्रिंट खोले
const LabelPrintDialog = lazy(() => import('../labels/LabelPrintDialog'))
import { S, nextAction, canCancel, isFinal, refundRequired, describeStatusError, STALE_MESSAGE } from '../utils/orderFlow'

const KINDS = ['सभी', 'ऑनलाइन', 'COD', 'AI सहायक']
const KIND_LABEL = {
  'सभी': { hi: 'सभी', en: 'All' },
  'ऑनलाइन': { hi: 'ऑनलाइन', en: 'Online' },
  COD: { hi: 'COD', en: 'COD' },
  'AI सहायक': { hi: 'AI सहायक', en: 'AI Assistant' },
}
const STAGE_DOT = { new: 'bg-blue-600', prep: 'bg-amber-500', transit: 'bg-purple-600', done: 'bg-emerald-600', cancelled: 'bg-red-600' }

const TXT = {
  title: { hi: 'ऑर्डर', en: 'Orders' },
  search: { hi: 'ऑर्डर नंबर, नाम या फ़ोन खोजें', en: 'Search order no., name or phone' },
  clear: { hi: 'हटाएँ', en: 'Clear' },
  all: { hi: 'सभी', en: 'All' },
  items: { hi: 'आइटम', en: 'items' },
  show: { hi: 'दिखाएँ', en: 'Show' },
  hide: { hi: 'छिपाएँ', en: 'Hide' },
  details: { hi: 'विवरण', en: 'Details' },
  hideDetails: { hi: 'विवरण छिपाएँ', en: 'Hide details' },
  more: { hi: 'और विकल्प', en: 'More options' },
  moreTitle: { hi: 'ऑर्डर के विकल्प', en: 'Order options' },
  whatsapp: { hi: 'WhatsApp', en: 'WhatsApp' },
  waTitle: { hi: 'WhatsApp अपडेट', en: 'WhatsApp update' },
  waHelp: { hi: 'संदेश (भेजने से पहले बदल सकते हैं)', en: 'Message (you can edit it before sending)' },
  waReset: { hi: 'दोबारा बनाएँ', en: 'Regenerate' },
  waOpen: { hi: 'WhatsApp खोलें', en: 'Open WhatsApp' },
  printLabel: { hi: 'लेबल प्रिंट', en: 'Print label' },
  previewPrint: { hi: 'लेबल प्रीव्यू / प्रिंट', en: 'Preview / print label' },
  cancelOrder: { hi: 'ऑर्डर रद्द करें', en: 'Cancel order' },
  cancelShort: { hi: 'रद्द करें', en: 'Cancel' },
  wait: { hi: 'कृपया रुकें...', en: 'Please wait...' },
  selected: { hi: 'चुने', en: 'selected' },
  selectVisible: { hi: 'सभी चुनें', en: 'Select visible' },
  clearSel: { hi: 'हटाएँ', en: 'Clear' },
  printSelected: { hi: 'लेबल प्रिंट', en: 'Print labels' },
  printSelectedFull: { hi: 'चुने हुए लेबल प्रिंट करें (Print Selected Labels)', en: 'Print selected labels' },
  empty: { hi: 'इस चयन में कोई ऑर्डर नहीं', en: 'No orders in this selection' },
  delivery: { hi: 'डिलीवरी', en: 'Delivery' },
  pin: { hi: 'डिलीवरी पिन', en: 'Delivery PIN' },
  mapFull: { hi: 'Google Maps में पूरा मार्ग देखें', en: 'Open route in Google Maps' },
  mapSearch: { hi: 'पते से मानचित्र पर खोजें (GPS लोकेशन उपलब्ध नहीं थी)', en: 'Search address on map (no GPS location)' },
  dismiss: { hi: 'बंद करें', en: 'Dismiss' },
  reason: { hi: 'कारण', en: 'Reason' },
  payment: { hi: 'भुगतान', en: 'Payment' },
  codUpi: { hi: 'डिलीवरी पर UPI', en: 'UPI on delivery' },
  codCash: { hi: 'कैश ऑन डिलीवरी', en: 'Cash on delivery' },
  select: { hi: 'लेबल के लिए चुनें', en: 'Select for label' },
  close: { hi: 'बंद करें', en: 'Close' },
  shown: { hi: 'ऑर्डर दिख रहे हैं', en: 'orders shown' },
}

export default function AdminOrders() {
  const { language } = useLanguage()
  const lang = language === 'en' ? 'en' : 'hi'
  const t = (k) => TXT[k][lang]
  const [search, setSearch] = useState('')
  const [moreFor, setMoreFor] = useState(null) // "और विकल्प" शीट वाले ऑर्डर की id
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

  const q = search.trim().toLowerCase()
  const byKind = orders
    .filter((o) =>
      kind === 'AI सहायक' ? o.order_source === 'AI सहायक'
      : kind === 'COD' ? isCod(o)
      : kind === 'ऑनलाइन' ? !isCod(o)
      : true)
    .filter((o) =>
      !q || [o.order_number, o.customer_name, o.customer_phone].some((v) => String(v || '').toLowerCase().includes(q)))

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

  const moreOrder = moreFor ? orders.find((o) => o.id === moreFor) : null
  const waOrderObj = waOrder ? orders.find((o) => o.id === waOrder) : null
  const waDisabled = (o) => customerWhatsAppNumber(o.customer_phone).length < 10

  if (loading) return <OrdersSkeleton />

  const fmtPlain = (o) => formatDate(o.created_at, lang)
  const stageLabelFor = (key) => STAGE_SHORT[key]?.[lang] || key

  function renderCard(o) {
    const busy = busyId === o.id
    const next = nextAction(o.order_status)
    const final = isFinal(o.order_status)
    const isOpen = expanded === o.id
    const newLike = (o.order_status === S.NEW || o.order_status === S.PAID) && canCancel(o.order_status)
    const itemsCount = (o.order_items || []).length
    const addr = `${o.full_address || ''}${o.mohalla ? `, ${o.mohalla}` : ''}${o.city ? `, ${o.city}` : ''}`
    return (
      <article key={o.id} className={`oc ${selected.has(o.id) ? 'is-selected' : ''}`}>
        <div className="oc-head">
          <label className="oc-check" aria-label={`${o.order_number} ${t('select')}`}>
            <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} />
          </label>
          <button type="button" className="oc-main" onClick={() => setExpanded(isOpen ? null : o.id)} aria-expanded={isOpen}>
            <span className="oc-row">
              <span className="oc-num">{o.order_number}</span>
              <span className="oc-amt">{formatRupee(o.total_amount)}</span>
            </span>
            <span className="oc-sub">{o.customer_name} • {o.customer_phone}</span>
          </button>
        </div>

        <div className="oc-chips">
          <StatusBadge status={o.order_status} />
          <span className={`oc-pill ${isPaid(o) ? 'green' : 'amber'}`}>{t('payment')}: {paymentText(o)}</span>
          {isCod(o) && <span className="oc-pill amber">{isCodOnline(o) ? t('codUpi') : t('codCash')}</span>}
          {o.order_source && o.order_source !== 'वेबसाइट' && <span className="oc-pill purple">{o.order_source}</span>}
        </div>

        {addr.trim() && <p className="oc-addr">{addr}</p>}
        <p className="oc-meta">
          {itemsCount} {t('items')} • {o.delivery_date} {o.delivery_time_slot ? `• ${o.delivery_time_slot}` : ''} • {fmtPlain(o)}
        </p>

        {refundRequired(o) && (
          <p className="admin-note red mt-2 font-bold">
            {lang === 'en'
              ? `Refund required — the customer's online payment (${formatRupee(o.total_amount)}) has not been returned yet. Payment: successful`
              : `रिफंड ज़रूरी — ग्राहक का ऑनलाइन भुगतान (${formatRupee(o.total_amount)}) अभी वापस नहीं हुआ। भुगतान: सफल`}
          </p>
        )}
        {o.order_status === S.CANCELLED && o.cancel_reason && (
          <p className="oc-meta">{t('reason')}: {o.cancel_reason}</p>
        )}

        {isOpen && (
          <div className="oc-details">
            <p>{addr}{o.pincode ? ` - ${o.pincode}` : ''}</p>
            <p>{t('delivery')}: {o.delivery_date} • {o.delivery_time_slot}</p>
            {o.delivery_pin && <p>{t('pin')}: <b className="font-mono">{o.delivery_pin}</b></p>}

            {o.latitude && o.longitude ? (
              <div className="mb-2">
                <iframe
                  title={`map-${o.id}`}
                  className="oc-map"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${o.longitude - 0.006}%2C${o.latitude - 0.006}%2C${o.longitude + 0.006}%2C${o.latitude + 0.006}&layer=mapnik&marker=${o.latitude}%2C${o.longitude}`}
                  loading="lazy"
                />
                <a href={`https://www.google.com/maps?q=${o.latitude},${o.longitude}`} target="_blank" rel="noreferrer" className="oc-maplink">
                  <Icon name="pin" size={17} /> {t('mapFull')}
                </a>
              </div>
            ) : (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.full_address}, ${o.mohalla || ''}, ${o.city} - ${o.pincode}`)}`}
                target="_blank"
                rel="noreferrer"
                className="oc-maplink"
              >
                <Icon name="pin" size={17} /> {t('mapSearch')}
              </a>
            )}

            <div className="oc-items mb-2">
              {(o.order_items || []).map((i) => (
                <div key={i.id}>
                  <span>{i.vegetable_name} x {i.quantity} {i.unit}{i.seller_name ? ` (${i.seller_name})` : ''}</span>
                  <span>{formatRupee(i.item_total)}</span>
                </div>
              ))}
            </div>
            {isOwner && <OrderProfit orderId={o.id} />}
          </div>
        )}

        <div className="oc-actions">
          {!final && next && (
            <button type="button" onClick={() => advance(o)} disabled={busy} className="admin-btn admin-btn-primary oc-primary">
              {busy ? t('wait') : next.label}
            </button>
          )}
          {final && (
            <>
              <button type="button" onClick={() => setExpanded(isOpen ? null : o.id)} className="admin-btn admin-btn-outline oc-primary">
                {isOpen ? t('hideDetails') : t('details')}
              </button>
              <button type="button" onClick={() => setPrintOrders([o])} className="admin-btn admin-btn-outline oc-primary">
                <Icon name="printer" size={18} /> {t('printLabel')}
              </button>
            </>
          )}
          {!final && newLike && (
            <button type="button" onClick={() => openCancel(o)} disabled={busy} className="admin-btn admin-btn-danger-outline">
              {t('cancelShort')}
            </button>
          )}
          {!final && !newLike && (
            <button
              type="button"
              onClick={() => openWa(o)}
              disabled={waDisabled(o)}
              aria-label={t('waTitle')}
              className="admin-btn admin-btn-wa has-label-sm"
            >
              <Icon name="message" size={18} /> <span className="oc-wa-label">{t('whatsapp')}</span>
            </button>
          )}
          <button type="button" onClick={() => setMoreFor(o.id)} className="admin-btn admin-btn-outline admin-btn-icon" aria-label={t('more')} aria-haspopup="dialog">
            <Icon name="more" size={20} />
          </button>
        </div>
      </article>
    )
  }

  return (
    <div>
      <AdminPageHeader title={t('title')} subtitle={`${byKind.filter((o) => stage === 'all' || stageOf(o).key === stage).length} ${t('shown')}`} />

      {notice && (
        <div role="alert" className={`admin-note ${notice.type === 'error' ? 'red' : 'blue'} mb-3 flex items-start justify-between gap-3 font-semibold`}>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs font-bold shrink-0 min-h-[44px] -my-3 px-1">{t('dismiss')}</button>
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

      {printOrders && (
        <Suspense fallback={null}>
          <LabelPrintDialog orders={printOrders} onClose={() => setPrintOrders(null)} onPrinted={() => loadOrders({ silent: true })} />
        </Suspense>
      )}

      <AdminSearchBar value={search} onChange={setSearch} placeholder={t('search')} clearLabel={t('clear')} className="mb-3" />

      <div className="flex flex-col gap-2 mb-4">
        <div className="admin-filter-row" role="group" aria-label={t('title')}>
          <button type="button" className="admin-fchip" aria-pressed={stage === 'all'} onClick={() => setStage('all')}>
            {t('all')}<b>{byKind.length}</b>
          </button>
          {ORDER_STAGES.map((st) => (
            <button key={st.key} type="button" className="admin-fchip" aria-pressed={stage === st.key} onClick={() => setStage(st.key)}>
              {stageLabelFor(st.key)}<b>{stageCount(st.key)}</b>
            </button>
          ))}
        </div>
        <div className="admin-filter-row" role="group">
          {KINDS.map((k) => (
            <button key={k} type="button" className="admin-fchip is-small" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {KIND_LABEL[k][lang]}
            </button>
          ))}
        </div>
      </div>

      <div>
        {groups.map(({ st, list }) => {
          const isCollapsed = stage === 'all' && collapsed[st.key]
          return (
            <section key={st.key} className="oc-group">
              <button
                type="button"
                className="oc-group-head"
                aria-expanded={!isCollapsed}
                disabled={stage !== 'all'}
                onClick={() => setCollapsed((c) => ({ ...c, [st.key]: !c[st.key] }))}
              >
                <span className={`oc-dot ${STAGE_DOT[st.key]}`} />
                <span>{st.label} <span className="cnt">({list.length})</span></span>
                {stage === 'all' && (
                  <span className="tog">{isCollapsed ? t('show') : t('hide')} <Icon name="chevronDown" size={16} /></span>
                )}
              </button>
              {!isCollapsed && <div className="oc-list">{list.map(renderCard)}</div>}
            </section>
          )
        })}

        {orders.length >= limit && (
          <button type="button" onClick={() => setLimit((l) => l + 200)} className="admin-btn admin-btn-outline admin-btn-block mt-4">
            {lang === 'en' ? `Load older orders (showing latest ${limit})` : `पुराने ऑर्डर लोड करें (अभी सबसे नए ${limit} दिख रहे हैं)`}
          </button>
        )}
        {groups.length === 0 && (
          <div className="admin-card"><AdminEmptyState icon="orders" text={t('empty')} /></div>
        )}
        {selected.size > 0 && <div style={{ height: 84 }} aria-hidden="true" />}
      </div>

      {selected.size > 0 && (
        <div className="admin-selbar" role="region" aria-label={t('printSelectedFull')}>
          <span className="cnt">{selected.size} {t('selected')}</span>
          <button type="button" className="lnk" onClick={() => setSelected(new Set(visibleIds))}>{t('selectVisible')}</button>
          <button type="button" className="lnk" onClick={() => setSelected(new Set())}>{t('clearSel')}</button>
          <button type="button" className="admin-btn admin-btn-primary" onClick={() => setPrintOrders(selectedOrders())} aria-label={t('printSelectedFull')}>
            <Icon name="printer" size={18} /> {t('printSelected')}
          </button>
        </div>
      )}

      {moreOrder && (
        <AdminBottomSheet title={`${t('moreTitle')} • ${moreOrder.order_number}`} onClose={() => setMoreFor(null)} closeLabel={t('close')} labelId="more-title">
          <div>
            <button type="button" className="admin-menu-item" onClick={() => { setMoreFor(null); openWa(moreOrder) }} disabled={waDisabled(moreOrder)}>
              <Icon name="message" size={22} /> {t('waTitle')}
            </button>
            <button type="button" className="admin-menu-item" onClick={() => { setMoreFor(null); setPrintOrders([moreOrder]) }}>
              <Icon name="printer" size={22} /> {t('previewPrint')}
            </button>
            <button type="button" className="admin-menu-item" onClick={() => { setExpanded(expanded === moreOrder.id ? null : moreOrder.id); setMoreFor(null) }}>
              <Icon name="eye" size={22} /> {expanded === moreOrder.id ? t('hideDetails') : t('details')}
            </button>
            {!isFinal(moreOrder.order_status) && canCancel(moreOrder.order_status) && (
              <button type="button" className="admin-menu-item danger" onClick={() => { setMoreFor(null); openCancel(moreOrder) }} disabled={busyId === moreOrder.id}>
                <Icon name="close" size={22} /> {t('cancelOrder')}
              </button>
            )}
          </div>
        </AdminBottomSheet>
      )}

      {waOrderObj && (
        <AdminBottomSheet
          title={t('waTitle')}
          onClose={() => setWaOrder(null)}
          closeLabel={t('close')}
          labelId="wa-title"
          footer={
            <>
              <button type="button" className="admin-btn admin-btn-outline" onClick={() => setWaText(buildCustomerUpdateText(waOrderObj, window.location.origin))}>
                {t('waReset')}
              </button>
              <a
                href={buildCustomerWhatsAppLink(waOrderObj.customer_phone, waText)}
                target="_blank"
                rel="noreferrer"
                onClick={() => setWaOrder(null)}
                className="admin-btn admin-btn-wa"
              >
                <Icon name="external" size={18} /> {t('waOpen')}
              </a>
            </>
          }
        >
          <p className="text-[13px] text-gray-600 mb-2 font-semibold">
            {t('waHelp')} — {waOrderObj.customer_name} • {waOrderObj.customer_phone}
          </p>
          <textarea value={waText} onChange={(e) => setWaText(e.target.value)} rows={9} className="admin-input" style={{ resize: 'vertical' }} />
        </AdminBottomSheet>
      )}
    </div>
  )
}

// स्थिति का बैज (टेक्स्ट हमेशा दिखता है; रंग सिर्फ़ मदद करता है)
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
  return <AdminStatusBadge label={status} tone={BADGE_TONE[status] || 'bg-gray-50 text-gray-600 border-gray-200'} />
}
