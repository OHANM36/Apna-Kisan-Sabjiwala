import { useLocation } from 'react-router-dom'
import Header from './Header'
import {
  AdminShellSkeleton,
  SimpleShellSkeleton,
  VegetableGridSkeleton,
  CategoryGridSkeleton,
  VendorGridSkeleton,
  CartSkeleton,
  OrderCardListSkeleton,
  OrderConfirmationSkeleton,
} from './Skeleton'

// पेज का कोड (lazy chunk) डाउनलोड होते समय दिखने वाला स्केलेटन — रूट के हिसाब से अलग ढाँचा
export default function RouteFallback() {
  const { pathname } = useLocation()

  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) return <AdminShellSkeleton />
  if (pathname.startsWith('/admin') || pathname.startsWith('/seller') || pathname.startsWith('/delivery')) {
    return <SimpleShellSkeleton />
  }

  let body
  if (pathname.startsWith('/order-confirmation')) body = <OrderConfirmationSkeleton />
  else if (pathname.startsWith('/orders')) body = <div className="px-4 py-4"><OrderCardListSkeleton /></div>
  else if (pathname.startsWith('/cart') || pathname.startsWith('/checkout')) body = <CartSkeleton />
  else if (pathname.startsWith('/categories')) body = <div className="px-4 py-4"><CategoryGridSkeleton /></div>
  else if (pathname.startsWith('/vendors')) body = <div className="px-4 py-4"><VendorGridSkeleton /></div>
  else body = <div className="px-3 py-3"><VegetableGridSkeleton count={6} /></div>

  return (
    <div className="min-h-screen pb-24">
      <Header />
      {body}
    </div>
  )
}
