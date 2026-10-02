import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import BottomNav from './components/BottomNav'
import FloatingCallButton from './components/FloatingCallButton'
import WelcomePopup from './components/WelcomePopup'
import CustomerOrderWatcher from './components/CustomerOrderWatcher'

import { AdminAuthProvider } from './context/AdminAuthContext'

import { SellerAuthProvider } from './context/SellerAuthContext'

import { DeliveryAuthProvider } from './context/DeliveryAuthContext'
import RouteFallback from './components/RouteFallback'

// हर पेज अलग फ़ाइल (chunk) में — ग्राहक को एडमिन/सेलर/डिलीवरी का कोड डाउनलोड नहीं करना पड़ता
const Categories = lazy(() => import('./pages/Categories'))
const Cart = lazy(() => import('./pages/Cart'))
const Checkout = lazy(() => import('./pages/Checkout'))
const OrderConfirmation = lazy(() => import('./pages/OrderConfirmation'))
const OrderHistory = lazy(() => import('./pages/OrderHistory'))
const Vendors = lazy(() => import('./pages/Vendors'))
const VendorDetail = lazy(() => import('./pages/VendorDetail'))
const AIOrderAssistant = lazy(() => import('./components/AIOrderAssistant'))
const AdminLogin = lazy(() => import('./admin/AdminLogin'))
const AdminLayout = lazy(() => import('./admin/AdminLayout'))
const AdminDashboard = lazy(() => import('./admin/AdminDashboard'))
const AdminVegetables = lazy(() => import('./admin/AdminVegetables'))
const AdminCategories = lazy(() => import('./admin/AdminCategories'))
const AdminBulkEdit = lazy(() => import('./admin/AdminBulkEdit'))
const AdminWelcomePopup = lazy(() => import('./admin/AdminWelcomePopup'))
const AdminOrders = lazy(() => import('./admin/AdminOrders'))
const AdminCustomers = lazy(() => import('./admin/AdminCustomers'))
const AdminReports = lazy(() => import('./admin/AdminReports'))
const AdminSellers = lazy(() => import('./admin/AdminSellers'))
const AdminDeliveryBoys = lazy(() => import('./admin/AdminDeliveryBoys'))
const AdminTodaysPrices = lazy(() => import('./admin/AdminTodaysPrices'))
const AdminProductPricing = lazy(() => import('./admin/AdminProductPricing'))
const AdminPricingSettings = lazy(() => import('./admin/AdminPricingSettings'))
const AdminPricingDashboard = lazy(() => import('./admin/AdminPricingDashboard'))
const AdminStock = lazy(() => import('./admin/AdminStock'))
const AdminOffers = lazy(() => import('./admin/AdminOffers'))
const AdminPaymentSettings = lazy(() => import('./admin/AdminPaymentSettings'))
const SellerSignup = lazy(() => import('./seller/SellerSignup'))
const SellerLogin = lazy(() => import('./seller/SellerLogin'))
const SellerLayout = lazy(() => import('./seller/SellerLayout'))
const SellerDashboard = lazy(() => import('./seller/SellerDashboard'))
const SellerVegetables = lazy(() => import('./seller/SellerVegetables'))
const SellerOrders = lazy(() => import('./seller/SellerOrders'))
const SellerProfile = lazy(() => import('./seller/SellerProfile'))
const DeliveryLogin = lazy(() => import('./delivery/DeliveryLogin'))
const DeliveryLayout = lazy(() => import('./delivery/DeliveryLayout'))
const DeliveryOrders = lazy(() => import('./delivery/DeliveryOrders'))

// खाली समय में अगले संभावित पेज पहले से लोड कर लें (कार्ट/चेकआउट तुरंत खुलें)
function usePrefetchCustomerPages() {
  useEffect(() => {
    const run = () => {
      import('./pages/Cart')
      import('./pages/Checkout')
      import('./pages/OrderHistory')
    }
    const id = 'requestIdleCallback' in window ? window.requestIdleCallback(run, { timeout: 4000 }) : setTimeout(run, 2500)
    return () => ('cancelIdleCallback' in window ? window.cancelIdleCallback(id) : clearTimeout(id))
  }, [])
}

export default function App() {
  usePrefetchCustomerPages()
  const location = useLocation()
  const isAdminRoute = location.pathname.startsWith('/admin')
  const isSellerRoute = location.pathname.startsWith('/seller')
  const isDeliveryRoute = location.pathname.startsWith('/delivery')

  return (
    <>
      <Suspense fallback={<RouteFallback />}>
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
                  <Route path="offers" element={<AdminOffers />} />
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
      </Suspense>

      {!isAdminRoute && !isSellerRoute && !isDeliveryRoute && <FloatingCallButton />}
      {!isAdminRoute && !isSellerRoute && !isDeliveryRoute && <WelcomePopup />}
      {!isAdminRoute && !isSellerRoute && !isDeliveryRoute && <CustomerOrderWatcher />}
      {!isAdminRoute && !isSellerRoute && !isDeliveryRoute && (
        <Suspense fallback={null}><AIOrderAssistant /></Suspense>
      )}
      {!isAdminRoute && !isSellerRoute && !isDeliveryRoute && <BottomNav />}
    </>
  )
}
