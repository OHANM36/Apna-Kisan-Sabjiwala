import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useDeliveryAuth } from '../context/DeliveryAuthContext'
import { formatRupee, formatDate } from '../utils/format'
import Loading from '../components/Loading'

const TABS = [
  { key: 'available', label: 'उपलब्ध ऑर्डर' },
  { key: 'mine', label: 'मेरी डिलीवरी' },
  { key: 'done', label: 'पूरी हुई' },
]

export default function DeliveryOrders() {
  const { deliveryBoy, token, logout } = useDeliveryAuth()
  const [tab, setTab] = useState('available')
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [confirmOrder, setConfirmOrder] = useState(null)
  const [confirmPin, setConfirmPin] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [notice, setNotice] = useState('')

  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const { data, error } = await supabase.rpc('delivery_orders', { p_token: token, p_tab: tab })
    if (error && /UNAUTHORIZED/.test(error.message || '')) {
      logout() // session खत्म/निष्क्रिय → लॉगिन पर वापस
      return
    }
    setOrders(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [tab, token])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // realtime की जगह हर 20 सेकंड polling (टैब दिख रहा हो तभी) — realtime सबके ऑर्डर-डेटा का रास्ता था
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) loadOrders(true)
    }, 20000)
    return () => clearInterval(id)
  }, [loadOrders])

  async function claimOrder(order) {
    setBusyId(order.id)
    const { data, error } = await supabase.rpc('delivery_claim_order', { p_token: token, p_order_id: order.id })
    setBusyId(null)
    if (error || !data?.ok) {
      setNotice(data?.error === 'TAKEN' ? 'यह ऑर्डर किसी और डिलीवरी बॉय ने ले लिया है।' : 'ऑर्डर नहीं मिल सका। दोबारा कोशिश करें।')
    } else {
      setNotice('')
    }
    loadOrders()
  }

  function openConfirm(order) {
    setConfirmOrder(order)
    setConfirmPin('')
    setConfirmError('')
  }

  function closeConfirm() {
    setConfirmOrder(null)
    setConfirmPin('')
    setConfirmError('')
  }

  async function submitConfirmPin(e) {
    e.preventDefault()
    if (!confirmOrder) return
    setBusyId(confirmOrder.id)
    // PIN की जाँच सर्वर पर होती है (5 गलत कोशिश पर लॉक); PIN इस डिवाइस को कभी नहीं भेजा जाता
    const { data, error } = await supabase.rpc('delivery_confirm', { p_token: token, p_order_id: confirmOrder.id, p_pin: confirmPin.trim() })
    setBusyId(null)
    if (error || !data?.ok) {
      setConfirmError(
        data?.error === 'LOCKED' ? 'बहुत गलत कोशिशें। एडमिन से संपर्क करें।'
        : data?.error === 'WRONG_PIN' ? 'गलत पिन! ग्राहक से सही 4 अंकों का पिन पूछें।'
        : 'कन्फर्म नहीं हो सका। दोबारा कोशिश करें।'
      )
      return
    }
    closeConfirm()
    loadOrders()
  }

  return (
    <div>
      <h1 className="font-extrabold text-xl text-gray-800 mb-1">नमस्ते, {deliveryBoy.full_name} 👋</h1>
      <p className="text-gray-500 text-sm mb-4">आज की डिलीवरी की सूची यहाँ देखें</p>

      <div className="flex gap-2 overflow-x-auto mb-4 no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border-2 ${
              tab === t.key ? 'bg-kisan text-white border-kisan' : 'bg-white text-gray-500 border-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice && <p className="bg-orange-50 border border-orange-200 text-orange-700 text-sm font-semibold rounded-xl px-4 py-3 mb-3">{notice}</p>}

      {loading ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((o) => (
            <div key={o.id} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex justify-between items-start cursor-pointer" onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
                <div>
                  <p className="font-bold text-gray-800 text-sm">{o.order_number}</p>
                  <p className="text-xs text-gray-500">{o.customer_name} • {o.customer_phone}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(o.created_at)} • {o.delivery_time_slot}</p>
                </div>
                <div className="text-right">
                  <p className="font-extrabold text-gray-800">{formatRupee(o.total_amount)}</p>
                  <span className="inline-block mt-1 text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                    {o.order_status}
                  </span>
                </div>
              </div>

              {expanded === o.id && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-2">{o.full_address}{o.mohalla ? `, ${o.mohalla}` : ''}, {o.city} - {o.pincode}</p>
                  <div className="flex flex-col gap-1 mb-1">
                    {o.order_items.map((i) => (
                      <div key={i.id} className="flex justify-between text-xs text-gray-600">
                        <span>{i.vegetable_name} x {i.quantity} {i.unit}</span>
                        <span>{formatRupee(i.item_total)}</span>
                      </div>
                    ))}
                  </div>
                  {o.extra_notes && <p className="text-xs text-gray-500 mt-2">📝 {o.extra_notes}</p>}
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <a
                  href={`tel:${o.customer_phone}`}
                  className="flex-1 text-center text-xs font-bold py-2 rounded-lg border-2 border-kisan text-kisan"
                >
                  📞 कॉल करें
                </a>
                <a
                  href={
                    o.latitude && o.longitude
                      ? `https://www.google.com/maps?q=${o.latitude},${o.longitude}`
                      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          `${o.full_address}, ${o.mohalla || ''}, ${o.city} - ${o.pincode}`
                        )}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 text-center text-xs font-bold py-2 rounded-lg border-2 border-kisan text-kisan"
                >
                  🗺️ मार्ग देखें
                </a>
              </div>

              {tab === 'available' && (
                <button
                  onClick={() => claimOrder(o)}
                  disabled={busyId === o.id}
                  className="btn-primary w-full mt-2 py-2.5 text-sm"
                >
                  {busyId === o.id ? 'भेजा जा रहा है...' : '🚴 मैं डिलीवर करूंगा'}
                </button>
              )}

              {tab === 'mine' && (
                <button
                  onClick={() => openConfirm(o)}
                  disabled={busyId === o.id}
                  className="btn-primary w-full mt-2 py-2.5 text-sm"
                >
                  {busyId === o.id ? 'सेव हो रहा है...' : '✅ डिलीवर हो गया'}
                </button>
              )}
            </div>
          ))}

          {orders.length === 0 && (
            <p className="text-gray-400 text-center py-16">
              {tab === 'available' && 'अभी कोई नया ऑर्डर उपलब्ध नहीं है'}
              {tab === 'mine' && 'फ़िलहाल आपके पास कोई डिलीवरी नहीं है'}
              {tab === 'done' && 'अभी तक कोई डिलीवरी पूरी नहीं हुई'}
            </p>
          )}
        </div>
      )}

      {confirmOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-3">
          <form onSubmit={submitConfirmPin} className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-extrabold text-lg text-gray-800">डिलीवरी पिन कन्फर्म करें</h2>
              <button type="button" onClick={closeConfirm} className="text-gray-400 text-xl">×</button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              {confirmOrder.order_number} — ग्राहक ({confirmOrder.customer_name}) से 4 अंकों का डिलीवरी पिन पूछें और यहाँ डालें।
            </p>
            <input
              autoFocus
              required
              inputMode="numeric"
              maxLength={4}
              className="input-field text-center text-2xl font-mono tracking-[0.5em]"
              value={confirmPin}
              onChange={(e) => {
                setConfirmError('')
                setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))
              }}
              placeholder="••••"
            />
            {confirmError && <p className="text-red-500 text-sm font-semibold mt-2">{confirmError}</p>}
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={closeConfirm} className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 font-bold text-gray-600">
                रद्द करें
              </button>
              <button type="submit" disabled={confirmPin.length !== 4} className="flex-1 btn-primary">
                कन्फर्म करें
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
