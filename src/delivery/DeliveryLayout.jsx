import { Suspense } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useDeliveryAuth } from '../context/DeliveryAuthContext'
import logo from '../assets/logo.png'
import { SimpleShellSkeleton, PageSkeleton } from '../components/Skeleton'

export default function DeliveryLayout() {
  const { deliveryBoy, isLoggedIn, loading, logout } = useDeliveryAuth()

  if (loading) {
    return <SimpleShellSkeleton />
  }

  if (!isLoggedIn) {
    return <Navigate to="/delivery/login" replace />
  }

  return (
    <div className="dp min-h-screen">
      {/* कॉम्पैक्ट ऐप-बार (≈64px) */}
      <header className="dp-appbar">
        <div className="dp-wrap flex items-center justify-between h-16">
          <div className="flex items-center gap-3 min-w-0">
            <img src={logo} alt="अपना किसान सब्ज़ीवाला" width="40" height="40" className="w-10 h-10 rounded-full object-cover border border-gray-200 shrink-0" />
            <div className="min-w-0">
              <p className="font-bold text-[15px] leading-tight text-gray-900 truncate">डिलीवरी पैनल</p>
              <p className="text-[13px] leading-tight text-gray-500 truncate">{deliveryBoy.full_name}</p>
            </div>
          </div>
          <button type="button" onClick={logout} aria-label="लॉगआउट" className="dp-iconbtn">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          </button>
        </div>
      </header>

      <main>
        <Suspense fallback={<div className="dp-wrap pt-4"><PageSkeleton /></div>}><Outlet /></Suspense>
      </main>
    </div>
  )
}
