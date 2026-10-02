import { Routes, Route, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Categories from './pages/Categories'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import OrderConfirmation from './pages/OrderConfirmation'
import OrderHistory from './pages/OrderHistory'
import Vendors from './pages/Vendors'
import VendorDetail from './pages/VendorDetail'
import BottomNav from './components/BottomNav'
import FloatingCallButton from './components/FloatingCallButton'
import WelcomePopup from './components/WelcomePopup'
import CustomerOrderWatcher from './components/CustomerOrderWatcher'
import AIOrderAssistant from './components/AIOrderAssistant'

import { AdminAuthProvider } from './context/AdminAuthContext'
import AdminLogin from './admin/AdminLogin'
import AdminLayout from './admin/AdminLayout'
import AdminDashboard from './admin/AdminDashboard'
import AdminVegetables from './admin/AdminVegetables'
import AdminCategories from './admin/AdminCategories'
import AdminBulkEdit from './admin/AdminBulkEdit'
import AdminWelcomePopup from './admin/AdminWelcomePopup'
import AdminOrders from './admin/AdminOrders'
import AdminCustomers from './admin/AdminCustomers'
import AdminReports from './admin/AdminReports'
import AdminSellers from './admin/AdminSellers'
import AdminDeliveryBoys from './admin/AdminDeliveryBoys'
import AdminTodaysPrices from './admin/AdminTodaysPrices'
import AdminProductPricing from './admin/AdminProductPricing'
import AdminPricingSettings from './admin/AdminPricingSettings'
import AdminPricingDashboard from './admin/AdminPricingDashboard'
import AdminStock from './admin/AdminStock'
import AdminPaymentSettings from './admin/AdminPaymentSettings'

import { SellerAuthProvider } from './context/SellerAuthContext'
import SellerSignup from './seller/SellerSignup'
import SellerLogin from './seller/SellerLogin'
import SellerLayout from './seller/SellerLayout'
import SellerDashboard from './seller/SellerDashboard'
import SellerVegetables from './seller/SellerVegetables'
import SellerOrders from './seller/SellerOrders'
import SellerProfile from './seller/SellerProfile'

import { DeliveryAuthProvider } from './context/DeliveryAuthContext'
import DeliveryLogin from './delivery/DeliveryLogin'
import DeliveryLayout from './delivery/DeliveryLayout'
import DeliveryOrders from './delivery/DeliveryOrders'

export default function App() {
  const location = useLocation()
  const isAdminRoute = location.pathname.startsWith('/admin')
  const isSellerRoute = location.pathname.startsWith('/seller')
  const isDeliveryRoute = location.pathname.startsWith('/delivery')

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
        <Route path="/vendors" element={<Vendors />} />
        <Route path="/vendors/:vendorId" element={<VendorDetail />} />

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
                  <Route path="categories" element={<AdminCategories />} />
                  <Route path="bulk-edit" element={<AdminBulkEdit />} />
                  <Route path="welcome-popup" element={<AdminWelcomePopup />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="customers" element={<AdminCustomers />} />
                  <Route path="reports" element={<AdminReports />} />
                  <Route path="sellers" element={<AdminSellers />} />
                  <Route path="delivery-boys" element={<AdminDeliveryBoys />} />
                  <Route path="todays-prices" element={<AdminTodaysPrices />} />
                  <Route path="product-pricing" element={<AdminProductPricing />} />
                  <Route path="pricing-settings" element={<AdminPricingSettings />} />
                  <Route path="payment-settings" element={<AdminPaymentSettings />} />
                  <Route path="pricing-dashboard" element={<AdminPricingDashboard />} />
                  <Route path="stock" element={<AdminStock />} />
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
                  <Route path="profile" element={<SellerProfile />} />
                </Route>
              </Routes>
            </SellerAuthProvider>
          }
        />

        {/* डिलीवरी बॉय पैनल */}
        <Route
          path="/delivery/*"
          element={
            <DeliveryAuthProvider>
              <Routes>
                <Route path="login" element={<DeliveryLogin />} />
                <Route element={<DeliveryLayout />}>
                  <Route index element={<DeliveryOrders />} />
                </Route>
              </Routes>
            </DeliveryAuthProvider>
          }
        />
      </Routes>

      {!isAdminRoute && !isSellerRoute && !isDeliveryRoute && <FloatingCallButton />}
      {!isAdminRoute && !isSellerRoute && !isDeliveryRoute && <WelcomePopup />}
      {!isAdminRoute && !isSellerRoute && !isDeliveryRoute && <CustomerOrderWatcher />}
      {!isAdminRoute && !isSellerRoute && !isDeliveryRoute && <AIOrderAssistant />}
      {!isAdminRoute && !isSellerRoute && !isDeliveryRoute && <BottomNav />}
    </>
  )
}
