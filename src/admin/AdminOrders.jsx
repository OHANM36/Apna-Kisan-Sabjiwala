import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext'
import OrderProfit from '../pricing/ui/OrderProfit'
import { supabase } from '../supabaseClient'
import { formatRupee, formatDate, statusStepsFor, ORDER_STAGES, stageOf, sortOrders } from '../utils/format'
import Loading from '../components/Loading'
import { isCod, isPaid, paymentText } from '../utils/paymentMethods'

const KINDS = ['सभी', 'AI सहायक', 'COD']

export default function AdminOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [params] = useSearchParams()
  const [kind, setKind] = useState('सभी')
  const initialStage = ORDER_STAGES.some((st) => st.key === params.get('stage')) ? params.get('stage') : 'all'
  const [stage, setStage] = useState(initialStage)
  const [collapsed, setCollapsed] = useState({ done: true, cancelled: true })
  const [expanded, setExpanded] = useState(null)
  const { isOwner } = useAdminAuth()

  useEffect(() => {
    loadOrders()
  }, [])

  async function loadOrders() {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }

  async function updateStatus(orderId, newStatus) {
    const { error } = await supabase.from('orders').update({ order_status: newStatus }).eq('id', orderId)
    if (error) {
      alert(/INVALID_TRANSITION/.test(error.message || '')
        ? 'पूरा/रद्द हुआ ऑर्डर वापस खोलने की अनुमति सिर्फ़ मालिक (owner) को है।'
        : 'स्थिति बदली नहीं जा सकी। दोबारा कोशिश करें।')
    }
    loadOrders()
  }

  const byKind = kind === 'AI सहायक'
    ? orders.filter((o) => o.order_source === 'AI सहायक')
    : kind === 'COD'
    ? orders.filter((o) => isCod(o))
    : orders

  const stageCount = (key) => byKind.filter((o) => stageOf(o).key === key).length
  const visibleStages = ORDER_STAGES.filter((st) => stage === 'all' || stage === st.key)
  const groups = visibleStages
    .map((st) => ({ st, list: sortOrders(byKind.filter((o) => stageOf(o).key === st.key)) }))
    .filter((g) => g.list.length > 0)

  const chip = (active) =>
    `whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border-2 ${
      active ? 'bg-kisan text-white border-kisan' : 'bg-white text-gray-500 border-gray-200'
    }`

  if (loading) return <Loading />

  return (
    <div>
      <h1 className="font-extrabold text-xl text-gray-800 mb-5">ऑर्डर प्रबंधन</h1>

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
              <div>
                <p className="font-bold text-gray-800 text-sm">{o.order_number}</p>
                <p className="text-xs text-gray-500">{o.customer_name} • {o.customer_phone}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(o.created_at)}</p>
                {o.order_source && o.order_source !== 'वेबसाइट' && (
                  <span className="inline-block mt-1 text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                    🤖 {o.order_source}
                  </span>
                )}
                {isCod(o) && (
                  <span className="inline-block mt-1 ml-1 text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                    💵 कैश ऑन डिलीवरी
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="font-extrabold text-gray-800">{formatRupee(o.total_amount)}</p>
                <p className={`text-xs font-bold ${isPaid(o) ? 'text-kisan' : 'text-orange-500'}`}>
                  भुगतान: {paymentText(o)}
                </p>
              </div>
            </div>

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
              </div>
            )}

            <div className="mt-3">
              <label className="text-xs font-semibold text-gray-500">ऑर्डर की स्थिति बदलें:</label>
              <select
                value={o.order_status}
                onChange={(e) => updateStatus(o.id, e.target.value)}
                className="input-field mt-1 text-sm py-2"
              >
                {[...statusStepsFor(o), 'रद्द'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
            </div>
            )}
          </section>
          )
        })}
        {groups.length === 0 && <p className="text-gray-400 text-center py-10">इस चयन में कोई ऑर्डर नहीं</p>}
      </div>
    </div>
  )
}
