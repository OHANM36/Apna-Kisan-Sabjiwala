import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { playStatusChangeSound } from '../utils/sounds'

const STORAGE_KEY_CUSTOMER = 'aks_customer_v1'

export default function CustomerOrderWatcher() {
  const [popup, setPopup] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    let phone = ''
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_CUSTOMER) || '{}')
      phone = saved.phone || ''
    } catch {
      phone = ''
    }

    if (!phone) return // अभी तक इस डिवाइस से कोई ऑर्डर नहीं हुआ

    const channel = supabase
      .channel(`customer-orders-watch-${phone}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `customer_phone=eq.${phone}` },
        (payload) => {
          const oldStatus = payload.old?.order_status
          const newStatus = payload.new?.order_status
          const oldPayment = payload.old?.payment_status
          const newPayment = payload.new?.payment_status

          if (oldStatus !== newStatus || oldPayment !== newPayment) {
            playStatusChangeSound()
            setPopup({
              orderId: payload.new.id,
              orderNumber: payload.new.order_number,
              status: newStatus,
              payment: newPayment,
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
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
            <p className="font-display font-bold text-kisan-ink text-sm">आपके ऑर्डर की स्थिति बदली</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {popup.orderNumber} — <span className="font-semibold text-kisan">{popup.status}</span>
            </p>
          </div>
          <button onClick={() => setPopup(null)} className="text-gray-400 text-lg leading-none">×</button>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={() => setPopup(null)} className="flex-1 text-xs font-bold text-gray-500 py-2">
            बंद करें
          </button>
          <button onClick={handleView} className="flex-1 text-xs font-bold bg-kisan text-white py-2 rounded-xl">
            ऑर्डर देखें
          </button>
        </div>
      </div>
    </div>
  )
}
