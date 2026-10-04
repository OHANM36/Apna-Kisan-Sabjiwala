import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext'
import { supabase } from '../supabaseClient'
import { playNewOrderSound, playStatusChangeSound, unlockSounds } from '../utils/sounds'
import AdminToastList from '../components/AdminToastList'
import { useLanguage } from '../context/LanguageContext'
import { usePT } from '../pricing/strings'
import { PendingSyncBanner } from '../pricing/ui/common'
import logo from '../assets/logo.png'
import { AdminShellSkeleton, PageSkeleton } from '../components/Skeleton'

const links = [
  { to: '/admin', label: 'डैशबोर्ड', icon: '📊', end: true },
  { to: '/admin/orders', label: 'ऑर्डर', icon: '📦' },
  { to: '/admin/vegetables', label: 'सब्ज़ियाँ', icon: '🥕' },
  { to: '/admin/categories', label: 'श्रेणियाँ', icon: '📂' },
  { to: '/admin/bulk-edit', label: 'कीमतें बदलें', icon: '💰' },
  { to: '/admin/todays-prices', labelKey: 'nav_todays_prices', icon: '🧮', ownerOnly: true },
  { to: '/admin/product-pricing', labelKey: 'nav_product_pricing', icon: '🏷️', ownerOnly: true },
  { to: '/admin/pricing-dashboard', labelKey: 'nav_pricing_dashboard', icon: '💹', ownerOnly: true },
  { to: '/admin/stock', labelKey: 'nav_stock', icon: '📦' },
  { to: '/admin/sellers', label: 'विक्रेता', icon: '🧑‍🌾' },
  { to: '/admin/delivery-boys', label: 'डिलीवरी बॉय', icon: '🛵' },
  { to: '/admin/customers', label: 'ग्राहक', icon: '👥' },
  { to: '/admin/offers', label: 'कूपन / ऑफर', icon: '🎟️', ownerOnly: true },
  { to: '/admin/reports', label: 'रिपोर्ट', icon: '📈' },
]

// "सेटिंग" टैब के अंदर के पेज
const settingsLinks = [
  { to: '/admin/pricing-settings', labelKey: 'nav_pricing_settings', icon: '🧮', ownerOnly: true },
  { to: '/admin/payment-settings', label: 'भुगतान विकल्प (COD)', icon: '💵', ownerOnly: true },
  { to: '/admin/welcome-popup', label: 'स्वागत पॉपअप', icon: '💬' },
]

export default function AdminLayout() {
  const { session, isAdmin, isOwner, loading, logout, adminProfile } = useAdminAuth()
  const pt = usePT()
  const { language, toggleLanguage } = useLanguage()
  const [toasts, setToasts] = useState([])
  const toastIdRef = useRef(0)
  const { pathname } = useLocation()
  const visibleSettings = settingsLinks.filter((l) => !l.ownerOnly || isOwner)
  const settingsActive = visibleSettings.some((l) => pathname.startsWith(l.to))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const showSettings = settingsOpen || settingsActive

  // ब्राउज़र पेज खुलते ही आवाज़ नहीं बजने देता — पहले एक टैप/क्लिक चाहिए। पहले टैप पर आवाज़ें अनलॉक कर देते हैं।
  const [audioReady, setAudioReady] = useState(() =>
    typeof navigator !== 'undefined' && navigator.userActivation ? navigator.userActivation.hasBeenActive : false
  )
  useEffect(() => {
    if (audioReady) {
      unlockSounds()
      return
    }
    const unlock = () => {
      unlockSounds()
      setAudioReady(true)
    }
    const events = ['pointerdown', 'touchstart', 'keydown']
    events.forEach((e) => window.addEventListener(e, unlock, { once: true, capture: true }))
    return () => events.forEach((e) => window.removeEventListener(e, unlock, { capture: true }))
  }, [audioReady])

  const pushToast = useCallback((message, type) => {
    const id = ++toastIdRef.current
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  useEffect(() => {
    if (!session || !isAdmin) return

    const channel = supabase
      .channel('admin-orders-watch')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          playNewOrderSound()
          pushToast(
            `🆕 नया ऑर्डर आया: ${payload.new.order_number} — ${payload.new.customer_name}${payload.new.payment_method === 'COD' ? ' • 💵 COD' : ''}`,
            'new-order'
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const oldStatus = payload.old?.order_status
          const newStatus = payload.new?.order_status
          const oldPayment = payload.old?.payment_status
          const newPayment = payload.new?.payment_status
          if (oldStatus !== newStatus || oldPayment !== newPayment) {
            playStatusChangeSound()
            pushToast(
              `🔄 ऑर्डर ${payload.new.order_number}: ${newStatus}${
                oldPayment !== newPayment ? ` • भुगतान: ${newPayment}` : ''
              }`,
              'status-change'
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session, isAdmin, pushToast])

  if (loading) {
    return <AdminShellSkeleton />
  }

  if (!session || !isAdmin) {
    return <Navigate to="/admin/login" replace />
  }

  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      <AdminToastList toasts={toasts} />
      <aside className="md:w-60 bg-kisan-dark text-white md:min-h-screen">
        <div className="p-5 flex items-center gap-2 border-b border-white/10">
          <img src={logo} alt="अपना किसान सब्ज़ीवाला" className="w-9 h-9 rounded-full object-cover shrink-0" />
          <div>
            <p className="font-extrabold text-sm leading-tight">अपना किसान सब्ज़ीवाला</p>
            <p className="text-[11px] text-green-200">एडमिन पैनल</p>
          </div>
        </div>
        <nav className="flex md:flex-col overflow-x-auto md:overflow-visible">
          {links.filter((l) => !l.ownerOnly || isOwner).map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-3.5 text-sm font-semibold whitespace-nowrap ${
                  isActive ? 'bg-white/10 border-l-4 border-kisan-orange' : 'text-green-100'
                }`
              }
            >
              <span>{l.icon}</span> {l.labelKey ? pt(l.labelKey) : l.label}
            </NavLink>
          ))}

          {visibleSettings.length > 0 && (
            <div className="contents md:block md:mt-2 md:border-t md:border-white/10">
              {/* डेस्कटॉप पर खुलने-बंद होने वाला "सेटिंग" टैब; मोबाइल पर आइटम सीधे पट्टी में दिखते हैं */}
              <button
                onClick={() => setSettingsOpen((o) => !o)}
                className={`hidden md:flex w-full items-center justify-between px-5 py-3.5 text-sm font-extrabold ${
                  settingsActive ? 'text-white' : 'text-green-100'
                }`}
                aria-expanded={showSettings}
              >
                <span className="flex items-center gap-3"><span>⚙️</span> सेटिंग</span>
                <span className="text-xs">{showSettings ? '▴' : '▾'}</span>
              </button>
              <div className={showSettings ? 'contents md:block' : 'contents md:hidden'}>
                {visibleSettings.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-5 md:pl-10 py-3 text-sm font-semibold whitespace-nowrap ${
                        isActive ? 'bg-white/10 border-l-4 border-kisan-orange' : 'text-green-100'
                      }`
                    }
                  >
                    <span>{l.icon}</span> {l.labelKey ? pt(l.labelKey) : l.label}
                  </NavLink>
                ))}
              </div>
            </div>
          )}
        </nav>
        <div className="hidden md:block p-5 mt-auto border-t border-white/10">
          <p className="text-xs text-green-200 mb-2">{adminProfile?.full_name}</p>
          <button onClick={toggleLanguage} className="text-xs font-bold text-green-100 mb-2 block">{language === 'hi' ? 'English' : 'हिंदी'}</button>
          <button onClick={logout} className="text-xs font-bold text-red-300">लॉगआउट करें</button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8">
        <div className="md:hidden flex justify-end gap-4 mb-3">
          <button onClick={toggleLanguage} className="text-xs font-bold text-gray-500">{language === 'hi' ? 'English' : 'हिंदी'}</button>
          <button onClick={logout} className="text-xs font-bold text-red-500">लॉगआउट</button>
        </div>
        {!audioReady && (
          <div className="mb-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-sm font-semibold px-3 py-2">
            🔔 नए ऑर्डर की आवाज़ चालू करने के लिए स्क्रीन पर कहीं भी एक बार टैप करें
          </div>
        )}
        {isOwner && <PendingSyncBanner />}
        <Suspense fallback={<PageSkeleton />}><Outlet /></Suspense>
      </main>
    </div>
  )
}
