import { useState } from 'react'
import { useCart } from '../context/CartContext'
import { formatRupee } from '../utils/format'

export default function VegetableCard({ veg }) {
  const { items, addToCart, increaseQty, decreaseQty } = useCart()
  const inCart = items.find((i) => i.id === veg.id)
  const unavailable = veg.stock_status === 'अनुपलब्ध'
  const [justAdded, setJustAdded] = useState(false)

  function handleAdd() {
    addToCart(veg)
    setJustAdded(true)
    setTimeout(() => setJustAdded(false), 600)
  }

  return (
    <div className="card overflow-hidden flex flex-col">
      <div className="relative aspect-square bg-gray-50 flex items-center justify-center">
        {veg.image_url ? (
          <img src={veg.image_url} alt={veg.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="text-6xl">{veg.emoji || '🥬'}</span>
        )}
        {unavailable && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="bg-gray-700 text-white text-xs font-bold px-3 py-1 rounded-full">अनुपलब्ध</span>
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <h3 className="font-bold text-gray-800 text-[15px] leading-tight">{veg.name}</h3>
        <p className="text-kisan font-extrabold text-lg">
          {formatRupee(veg.price)} <span className="text-xs text-gray-500 font-medium">/ {veg.unit}</span>
        </p>

        <div className="mt-auto pt-2">
          {!inCart ? (
            <button
              onClick={handleAdd}
              disabled={unavailable}
              className={`w-full py-2 rounded-lg font-bold text-sm transition-all ${
                justAdded ? 'bg-kisan-orange text-white' : 'bg-kisan text-white active:scale-95'
              } disabled:opacity-40`}
            >
              {unavailable ? 'अनुपलब्ध' : 'कार्ट में डालें'}
            </button>
          ) : (
            <div className="flex items-center justify-between bg-kisan rounded-lg overflow-hidden">
              <button
                onClick={() => decreaseQty(veg.id)}
                className="text-white font-bold text-lg w-9 h-9 active:bg-kisan-dark"
              >
                −
              </button>
              <span className="text-white font-bold text-sm">{inCart.quantity}</span>
              <button
                onClick={() => increaseQty(veg.id)}
                className="text-white font-bold text-lg w-9 h-9 active:bg-kisan-dark"
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
