import { Suspense } from 'react'
import Loading from '../components/Loading'
import { Navigate, Outlet } from 'react-router-dom'
import { useDeliveryAuth } from '../context/DeliveryAuthContext'
import logo from '../assets/logo.png'

export default function DeliveryLayout() {
  const { deliveryBoy, isLoggedIn, loading, logout } = useDeliveryAuth()

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">लोड हो रहा है...</div>
  }

  if (!isLoggedIn) {
    return <Navigate to="/delivery/login" replace />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-kisan-dark text-white p-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <img src={logo} alt="अपना किसान सब्ज़ीवाला" className="w-9 h-9 rounded-full object-cover" />
          <div>
            <p className="font-extrabold text-sm leading-tight">डिलीवरी पैनल</p>
            <p className="text-[11px] text-green-200">{deliveryBoy.full_name}</p>
          </div>
        </div>
        <button onClick={logout} className="text-xs font-bold text-red-300">लॉगआउट</button>
      </header>

      <main className="p-4">
        <Suspense fallback={<Loading />}><Outlet /></Suspense>
      </main>
    </div>
  )
}
