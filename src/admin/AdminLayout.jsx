import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext'

const links = [
  { to: '/admin', label: 'डैशबोर्ड', icon: '📊', end: true },
  { to: '/admin/vegetables', label: 'सब्ज़ियाँ', icon: '🥕' },
  { to: '/admin/orders', label: 'ऑर्डर', icon: '📦' },
  { to: '/admin/customers', label: 'ग्राहक', icon: '👥' },
  { to: '/admin/reports', label: 'रिपोर्ट', icon: '📈' },
]

export default function AdminLayout() {
  const { session, isAdmin, loading, logout, adminProfile } = useAdminAuth()

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">लोड हो रहा है...</div>
  }

  if (!session || !isAdmin) {
    return <Navigate to="/admin/login" replace />
  }

  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      <aside className="md:w-60 bg-kisan-dark text-white md:min-h-screen">
        <div className="p-5 flex items-center gap-2 border-b border-white/10">
          <span className="text-2xl">🥬</span>
          <div>
            <p className="font-extrabold text-sm leading-tight">अपना किसान सब्ज़ीवाला</p>
            <p className="text-[11px] text-green-200">एडमिन पैनल</p>
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
          <p className="text-xs text-green-200 mb-2">{adminProfile?.full_name}</p>
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
