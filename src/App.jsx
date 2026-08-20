import { Routes, Route, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Categories from './pages/Categories'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import OrderConfirmation from './pages/OrderConfirmation'
import OrderHistory from './pages/OrderHistory'
import BottomNav from './components/BottomNav'
import FloatingCallButton from './components/FloatingCallButton'
import WelcomePopup from './components/WelcomePopup'

import { AdminAuthProvider } from './context/AdminAuthContext'
import AdminLogin from './admin/AdminLogin'
import AdminLayout from './admin/AdminLayout'
import AdminDashboard from './admin/AdminDashboard'
import AdminVegetables from './admin/AdminVegetables'
import AdminBulkEdit from './admin/AdminBulkEdit'
import AdminWelcomePopup from './admin/AdminWelcomePopup'
import AdminOrders from './admin/AdminOrders'
import AdminCustomers from './admin/AdminCustomers'
import AdminReports from './admin/AdminReports'
import AdminSellers from './admin/AdminSellers'

import { SellerAuthProvider } from './context/SellerAuthContext'
import SellerSignup from './seller/SellerSignup'
import SellerLogin from './seller/SellerLogin'
import SellerLayout from './seller/SellerLayout'
import SellerDashboard from './seller/SellerDashboard'
import SellerVegetables from './seller/SellerVegetables'
import SellerOrders from './seller/SellerOrders'

export default function App() {
  const location = useLocation()
  const isAdminRoute = location.pathname.startsWith('/admin')
  const isSellerRoute = location.pathname.startsWith('/seller')

  return (
    <>
      <Routes>
        {/* ग्राहक ऐप */}
        <Route path="/" element={<Home />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/order-confirmation/:orderId" element={<OrderConfirmation />} />
        <Route path="/orders" element={<OrderHistory />} />

        {/* एडमिन पैनल */}
        <Route
          path="/admin/*"
          element={
            <AdminAuthProvider>
              <Routes>
                <Route path="login" element={<AdminLogin />} />
                <Route element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="vegetables" element={<AdminVegetables />} />
                  <Route path="bulk-edit" element={<AdminBulkEdit />} />
                  <Route path="welcome-popup" element={<AdminWelcomePopup />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="customers" element={<AdminCustomers />} />
                  <Route path="reports" element={<AdminReports />} />
                  <Route path="sellers" element={<AdminSellers />} />
                </Route>
              </Routes>
            </AdminAuthProvider>
          }
        />

        {/* विक्रेता पैनल */}
        <Route
          path="/seller/*"
          element={
            <SellerAuthProvider>
              <Routes>
                <Route path="login" element={<SellerLogin />} />
                <Route path="signup" element={<SellerSignup />} />
                <Route element={<SellerLayout />}>
                  <Route index element={<SellerDashboard />} />
                  <Route path="vegetables" element={<SellerVegetables />} />
                  <Route path="orders" element={<SellerOrders />} />
                </Route>
              </Routes>
            </SellerAuthProvider>
          }
        />
      </Routes>

      {!isAdminRoute && !isSellerRoute && <FloatingCallButton />}
      {!isAdminRoute && !isSellerRoute && <WelcomePopup />}
      {!isAdminRoute && !isSellerRoute && <BottomNav />}
    </>
  )
}
