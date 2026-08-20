import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { useSellerAuth } from '../context/SellerAuthContext'
import logo from '../assets/logo.png'

const links = [
  { to: '/seller', label: 'डैशबोर्ड', icon: '📊', end: true },
  { to: '/seller/vegetables', label: 'मेरी सब्ज़ियाँ', icon: '🥕' },
  { to: '/seller/orders', label: 'मेरे ऑर्डर', icon: '📦' },
]

export default function SellerLayout() {
  const { session, sellerProfile, isSeller, isApproved, loading, logout } = useSellerAuth()

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">लोड हो रहा है...</div>
  }

  if (!session || !isSeller) {
    return <Navigate to="/seller/login" replace />
  }

  if (!sellerProfile.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <span className="text-5xl block mb-3">🚫</span>
          <h2 className="font-bold text-lg text-gray-800 mb-2">आपका खाता निष्क्रिय कर दिया गया है</h2>
          <p className="text-gray-500 text-sm mb-4">कृपया एडमिन से संपर्क करें।</p>
          <button onClick={logout} className="text-kisan font-bold text-sm">लॉगआउट करें</button>
        </div>
      </div>
    )
  }

  if (!isApproved) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <span className="text-5xl block mb-3">⏳</span>
          <h2 className="font-bold text-lg text-gray-800 mb-2">आपका आवेदन समीक्षा में है</h2>
          <p className="text-gray-500 text-sm mb-4">
            एडमिन आपके खाते को अप्रूव करने के बाद आप सब्ज़ियाँ जोड़ना शुरू कर सकेंगे। कृपया थोड़ी देर बाद दोबारा जांचें।
          </p>
          <button onClick={logout} className="text-kisan font-bold text-sm">लॉगआउट करें</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      <aside className="md:w-60 bg-kisan-dark text-white md:min-h-screen">
        <div className="p-5 flex items-center gap-2 border-b border-white/10">
          <img src={logo} alt="अपना किसान सब्ज़ीवाला" className="w-9 h-9 rounded-full object-cover shrink-0" />
          <div>
            <p className="font-extrabold text-sm leading-tight">{sellerProfile.business_name}</p>
            <p className="text-[11px] text-green-200">विक्रेता पैनल</p>
          </div>
        </div>
        <nav className="flex md:flex-col overflow-x-auto md:overflow-visible">
          {links.map((l) => (
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
              <span>{l.icon}</span> {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden md:block p-5 mt-auto border-t border-white/10">
          <p className="text-xs text-green-200 mb-2">{sellerProfile.owner_name}</p>
          <button onClick={logout} className="text-xs font-bold text-red-300">लॉगआउट करें</button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8">
        <div className="md:hidden flex justify-end mb-3">
          <button onClick={logout} className="text-xs font-bold text-red-500">लॉगआउट</button>
        </div>
        <Outlet />
      </main>
    </div>
  )
}
