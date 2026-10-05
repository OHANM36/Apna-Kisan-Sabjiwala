import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { playStatusChangeSound } from '../utils/soundsLazy'
import { getMyOrders } from '../utils/myOrders'
import { syncCustomerPush } from '../utils/customerPush'
import { useLanguage } from '../context/LanguageContext'

const POLL_MS = 30000
const FINAL = ['डिलीवरी पूरी हुई', 'रद्द']

// ऑर्डर-स्थिति सूचना: अब realtime (जो सबके ऑर्डर-डेटा का रास्ता खोलता था) की जगह get_orders_status RPC की polling।
// RPC सिर्फ़ उन्हीं ऑर्डर की स्थिति लौटाता है जिनका access_token इस डिवाइस के पास है।
export default function CustomerOrderWatcher() {
  const { t, tStatus } = useLanguage()
  const [popup, setPopup] = useState(null)
  const navigate = useNavigate()
  const known = useRef(new Map())

  useEffect(() => {
    let stopped = false

    async function poll() {
      if (document.hidden) return
      const mine = getMyOrders().filter((o) => Date.now() - (o.at || 0) < 3 * 86400000).slice(0, 10)
      const watch = mine.filter((o) => !FINAL.includes(known.current.get(o.id)?.order_status))
      if (watch.length === 0) return
      const { data, error } = await supabase.rpc('get_orders_status', { p_orders: watch.map((o) => ({ id: o.id, token: o.token })) })
      if (stopped || error || !Array.isArray(data)) return
      for (const o of data) {
        const prev = known.current.get(o.id)
        known.current.set(o.id, o)
        if (prev && (prev.order_status !== o.order_status || prev.payment_status !== o.payment_status)) {
          playStatusChangeSound()
          setPopup({ orderId: o.id, orderNumber: o.order_number, status: o.order_status })
        }
      }
    }

    syncCustomerPush() // ऐप खुलने पर: इस डिवाइस के चालू ऑर्डर की push जुड़ावें ताज़ा करें
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [])

  if (!popup) return null

  function handleView() {
    navigate(`/order-confirmation/${popup.orderId}`)
    setPopup(null)
  }

  return (
    <div className="fixed top-4 left-4 right-4 z-50 flex justify-center">
      <div className="bg-white rounded-2xl shadow-xl border-2 border-kisan max-w-sm w-full p-4 animate-fade-slide-in">
        <div className="flex items-start gap-3">
          <span className="text-2xl">📦</span>
          <div className="flex-1">
            <p className="font-display font-bold text-kisan-ink text-sm">{t('watcher_title')}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {popup.orderNumber} — <span className="font-semibold text-kisan">{tStatus(popup.status)}</span>
            </p>
          </div>
          <button onClick={() => setPopup(null)} className="text-gray-400 text-lg leading-none">×</button>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={() => setPopup(null)} className="flex-1 text-xs font-bold text-gray-500 py-2">
            {t('watcher_close')}
          </button>
          <button onClick={handleView} className="flex-1 text-xs font-bold bg-kisan text-white py-2 rounded-xl">
            {t('watcher_view')}
          </button>
        </div>
      </div>
    </div>
  )
}
