import { Routes, Route, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Categories from './pages/Categories'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import OrderConfirmation from './pages/OrderConfirmation'
import OrderHistory from './pages/OrderHistory'
import BottomNav from './components/BottomNav'
import FloatingCallButton from './components/FloatingCallButton'

import { AdminAuthProvider } from './context/AdminAuthContext'
import AdminLogin from './admin/AdminLogin'
import AdminLayout from './admin/AdminLayout'
import AdminDashboard from './admin/AdminDashboard'
import AdminVegetables from './admin/AdminVegetables'
import AdminBulkEdit from './admin/AdminBulkEdit'
import AdminOrders from './admin/AdminOrders'
import AdminCustomers from './admin/AdminCustomers'
import AdminReports from './admin/AdminReports'

export default function App() {
  const location = useLocation()
  const isAdminRoute = location.pathname.startsWith('/admin')

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
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="customers" element={<AdminCustomers />} />
                  <Route path="reports" element={<AdminReports />} />
                </Route>
              </Routes>
            </AdminAuthProvider>
          }
        />
      </Routes>

      {!isAdminRoute && <FloatingCallButton />}
      {!isAdminRoute && <BottomNav />}
    </>
  )
}
