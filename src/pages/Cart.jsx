import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useSettings } from '../context/SettingsContext'
import { useLanguage } from '../context/LanguageContext'
import Header from '../components/Header'
import { formatRupee } from '../utils/format'
import { calculateDeliveryFee, nextDeliveryBenefit, minOrderShortfall } from '../pricing/delivery'
import { CartSkeleton } from '../components/Skeleton'

export default function Cart() {
  const { items, increaseQty, decreaseQty, removeFromCart, subtotal, syncPrices } = useCart()
  const { settings, deliveryRules, loading: settingsLoading } = useSettings()
  const { t, tName, tUnit } = useLanguage()
  const navigate = useNavigate()

  const [notice, setNotice] = useState('')

  // कार्ट खुलते ही प्रकाशित (नई) कीमतों से मिलाएं — पुरानी कीमत पर ऑर्डर न बने
  useEffect(() => {
    let alive = true
    syncPrices().then((r) => {
      if (!alive) return
      if (r.removed.length) setNotice(t('cart_items_removed'))
      else if (r.changed.length) setNotice(t('cart_prices_updated'))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shortfall = minOrderShortfall(subtotal, settings.min_order_value)
  const belowMin = shortfall > 0
  const { fee: deliveryFee } = calculateDeliveryFee(subtotal, deliveryRules, settings)
  const benefit = !belowMin ? nextDeliveryBenefit(subtotal, deliveryRules, settings) : null
  const total = subtotal + deliveryFee

  // सेटिंग्स आने तक पुराने डिफ़ॉल्ट से बिल न दिखे — पहले स्केलेटन
  if (settingsLoading && items.length > 0) {
    return (
      <div className="min-h-screen pb-24">
        <Header />
        <CartSkeleton />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen pb-24">
        <Header />
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
          <span className="text-7xl mb-4">🛒</span>
          <h2 className="font-bold text-gray-700 text-lg mb-1">{t('cart_empty_title')}</h2>
          <p className="text-gray-500 text-sm mb-6">{t('cart_empty_subtitle')}</p>
          <Link to="/" className="btn-primary">{t('cart_browse_vegetables')}</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-40">
      <Header />
      <div className="px-4 py-4 animate-fade-slide-in">
        <h2 className="font-bold text-gray-800 text-lg mb-3">{t('cart_title')}</h2>

        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <div key={item.id} className="card p-3 flex items-center gap-3">
              <div className="w-16 h-16 bg-gray-50 rounded-xl flex items-center justify-center text-3xl overflow-hidden shrink-0">
                {item.image_url ? (
                  <img src={item.image_url} alt={tName(item)} className="w-full h-full object-cover" />
                ) : (
                  item.emoji || '🥬'
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-800 text-sm truncate">{tName(item)}</h3>
                {item.sellerName && (
                  <p className="text-[11px] text-gray-400 font-semibold">🧑‍🌾 {item.sellerName}</p>
                )}
                <p className="text-gray-500 text-xs">{formatRupee(item.price)} / {tUnit(item.unit)}</p>
                <p className="text-kisan font-bold text-sm mt-0.5">{formatRupee(item.price * item.quantity)}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <button onClick={() => removeFromCart(item.id)} className="text-red-500 text-xs font-semibold">
                  {t('cart_remove')}
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

        {notice && (
          <div className="mt-4 bg-blue-50 border border-blue-200 text-blue-700 text-sm font-semibold rounded-xl px-4 py-3">{notice}</div>
        )}

        {belowMin && (
          <div className="mt-4 bg-orange-50 border border-orange-200 text-orange-700 text-sm font-semibold rounded-xl px-4 py-3">
            {t('cart_min_order_msg').replace('{min}', settings.min_order_value).replace('{add}', shortfall)}
          </div>
        )}

        {benefit && (
          <div className="mt-4 bg-green-50 border border-green-200 text-green-700 text-sm font-semibold rounded-xl px-4 py-3">
            {(benefit.isFree ? t('cart_delivery_free_hint') : t('cart_delivery_cheaper_hint')).replace('{add}', benefit.addAmount).replace('{fee}', benefit.fee)}
          </div>
        )}

        <div className="card p-4 mt-4">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>{t('cart_subtotal')}</span>
            <span className="font-semibold">{formatRupee(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>{t('cart_delivery_fee')}</span>
            <span className="font-semibold">{deliveryFee === 0 ? t('cart_free') : formatRupee(deliveryFee)}</span>
          </div>
          <div className="border-t border-dashed border-gray-200 mt-2 pt-2 flex justify-between font-extrabold text-gray-800">
            <span>{t('cart_total')}</span>
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
          {t('cart_proceed')}
        </button>
      </div>
    </div>
  )
}
