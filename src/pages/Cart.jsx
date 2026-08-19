import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useSettings } from '../context/SettingsContext'
import Header from '../components/Header'
import { formatRupee } from '../utils/format'

export default function Cart() {
  const { items, increaseQty, decreaseQty, removeFromCart, subtotal } = useCart()
  const { settings } = useSettings()
  const navigate = useNavigate()

  const belowMin = subtotal < settings.min_order_value
  const deliveryFee =
    settings.free_delivery_above && subtotal >= settings.free_delivery_above ? 0 : settings.delivery_fee
  const total = subtotal + deliveryFee

  if (items.length === 0) {
    return (
      <div className="min-h-screen pb-24">
        <Header />
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
          <span className="text-7xl mb-4">🛒</span>
          <h2 className="font-bold text-gray-700 text-lg mb-1">आपका कार्ट खाली है</h2>
          <p className="text-gray-500 text-sm mb-6">कुछ ताज़ी सब्ज़ियाँ जोड़ें और ऑर्डर करें</p>
          <Link to="/" className="btn-primary">सब्ज़ियाँ देखें</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-40">
      <Header />
      <div className="px-4 py-4">
        <h2 className="font-bold text-gray-800 text-lg mb-3">आपका कार्ट</h2>

        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <div key={item.id} className="card p-3 flex items-center gap-3">
              <div className="w-16 h-16 bg-gray-50 rounded-xl flex items-center justify-center text-3xl overflow-hidden shrink-0">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  item.emoji || '🥬'
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-800 text-sm truncate">{item.name}</h3>
                <p className="text-gray-500 text-xs">{formatRupee(item.price)} / {item.unit}</p>
                <p className="text-kisan font-bold text-sm mt-0.5">{formatRupee(item.price * item.quantity)}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <button onClick={() => removeFromCart(item.id)} className="text-red-500 text-xs font-semibold">
                  हटाएं
                </button>
                <div className="flex items-center bg-kisan rounded-lg overflow-hidden">
                  <button onClick={() => decreaseQty(item.id)} className="text-white font-bold w-8 h-8 active:bg-kisan-dark">−</button>
                  <span className="text-white font-bold text-sm w-6 text-center">{item.quantity}</span>
                  <button onClick={() => increaseQty(item.id)} className="text-white font-bold w-8 h-8 active:bg-kisan-dark">+</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {belowMin && (
          <div className="mt-4 bg-orange-50 border border-orange-200 text-orange-700 text-sm font-semibold rounded-xl px-4 py-3">
            न्यूनतम ऑर्डर राशि {formatRupee(settings.min_order_value)} है। कृपया {formatRupee(settings.min_order_value - subtotal)} की और सब्ज़ियाँ जोड़ें।
          </div>
        )}

        <div className="card p-4 mt-4">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>सामान का कुल मूल्य</span>
            <span className="font-semibold">{formatRupee(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>डिलीवरी शुल्क</span>
            <span className="font-semibold">{deliveryFee === 0 ? 'मुफ़्त' : formatRupee(deliveryFee)}</span>
          </div>
          <div className="border-t border-dashed border-gray-200 mt-2 pt-2 flex justify-between font-extrabold text-gray-800">
            <span>कुल भुगतान</span>
            <span className="text-kisan">{formatRupee(total)}</span>
          </div>
        </div>
      </div>

      <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-200 p-4 safe-bottom">
        <button
          disabled={belowMin}
          onClick={() => navigate('/checkout')}
          className="btn-primary w-full"
        >
          ऑर्डर करने के लिए आगे बढ़ें
        </button>
      </div>
    </div>
  )
}
