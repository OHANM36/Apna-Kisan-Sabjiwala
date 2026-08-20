import { useMemo, useState } from 'react'
import { useCart } from '../context/CartContext'
import { formatRupee } from '../utils/format'

function tierCartId(vegId, tier) {
  return `${vegId}::${tier.qty}-${tier.unit}`
}

export default function VegetableCard({ veg }) {
  const { items, addToCart, increaseQty, decreaseQty } = useCart()
  const unavailable = veg.stock_status === 'अनुपलब्ध'
  const [justAdded, setJustAdded] = useState(false)

  const tiers = useMemo(
    () => (Array.isArray(veg.price_tiers) && veg.price_tiers.length > 0 ? veg.price_tiers : null),
    [veg.price_tiers]
  )

  const [selectedTierIdx, setSelectedTierIdx] = useState(0)
  const selectedTier = tiers ? tiers[selectedTierIdx] : null

  // सामान्य (बिना tier वाली) सब्ज़ी के लिए
  const inCartSimple = items.find((i) => i.id === veg.id)

  // Tier वाली सब्ज़ी के लिए - चुने गए tier का कार्ट में मौजूद होना
  const selectedTierCartId = selectedTier ? tierCartId(veg.id, selectedTier) : null
  const inCartTiered = selectedTierCartId ? items.find((i) => i.id === selectedTierCartId) : null

  function handleAddSimple() {
    addToCart(veg)
    flashAdded()
  }

  function handleAddTiered() {
    if (!selectedTier) return
    addToCart({
      id: tierCartId(veg.id, selectedTier),
      vegetableId: veg.id,
      sellerId: veg.seller_id || null,
      name: veg.name,
      emoji: veg.emoji,
      image_url: veg.image_url,
      price: selectedTier.price,
      unit: `${selectedTier.qty} ${selectedTier.unit}`,
    })
    flashAdded()
  }

  function flashAdded() {
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

        {!tiers ? (
          <p className="text-kisan font-extrabold text-lg">
            {formatRupee(veg.price)} <span className="text-xs text-gray-500 font-medium">/ {veg.unit}</span>
          </p>
        ) : (
          <p className="text-kisan font-extrabold text-lg">
            {formatRupee(selectedTier.price)}{' '}
            <span className="text-xs text-gray-500 font-medium">/ {selectedTier.qty} {selectedTier.unit}</span>
          </p>
        )}

        {tiers && (
          <select
            value={selectedTierIdx}
            onChange={(e) => setSelectedTierIdx(Number(e.target.value))}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 font-semibold text-gray-600 mb-1"
          >
            {tiers.map((t, idx) => (
              <option key={idx} value={idx}>
                {t.qty} {t.unit} — {formatRupee(t.price)}
              </option>
            ))}
          </select>
        )}

        <div className="mt-auto pt-2">
          {!tiers ? (
            !inCartSimple ? (
              <button
                onClick={handleAddSimple}
                disabled={unavailable}
                className={`w-full py-2 rounded-lg font-bold text-sm transition-all ${
                  justAdded ? 'bg-kisan-orange text-white' : 'bg-kisan text-white active:scale-95'
                } disabled:opacity-40`}
              >
                {unavailable ? 'अनुपलब्ध' : 'कार्ट में डालें'}
              </button>
            ) : (
              <div className="flex items-center justify-between bg-kisan rounded-lg overflow-hidden">
                <button onClick={() => decreaseQty(veg.id)} className="text-white font-bold text-lg w-9 h-9 active:bg-kisan-dark">−</button>
                <span className="text-white font-bold text-sm">{inCartSimple.quantity}</span>
                <button onClick={() => increaseQty(veg.id)} className="text-white font-bold text-lg w-9 h-9 active:bg-kisan-dark">+</button>
              </div>
            )
          ) : !inCartTiered ? (
            <button
              onClick={handleAddTiered}
              disabled={unavailable}
              className={`w-full py-2 rounded-lg font-bold text-sm transition-all ${
                justAdded ? 'bg-kisan-orange text-white' : 'bg-kisan text-white active:scale-95'
              } disabled:opacity-40`}
            >
              {unavailable ? 'अनुपलब्ध' : 'कार्ट में डालें'}
            </button>
          ) : (
            <div className="flex items-center justify-between bg-kisan rounded-lg overflow-hidden">
              <button onClick={() => decreaseQty(selectedTierCartId)} className="text-white font-bold text-lg w-9 h-9 active:bg-kisan-dark">−</button>
              <span className="text-white font-bold text-sm">{inCartTiered.quantity}</span>
              <button onClick={() => increaseQty(selectedTierCartId)} className="text-white font-bold text-lg w-9 h-9 active:bg-kisan-dark">+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
