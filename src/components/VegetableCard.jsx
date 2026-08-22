import { useMemo, useState } from 'react'
import { useCart } from '../context/CartContext'
import { formatRupee } from '../utils/format'
import VeggieCharacter from './VeggieCharacter'

function tierCartId(vegId, tier) {
  return `${vegId}::${tier.qty}-${tier.unit}`
}

export default function VegetableCard({ veg }) {
  const { items, addToCart, increaseQty, decreaseQty } = useCart()
  const unavailable = veg.stock_status === 'अनुपलब्ध'
  const [justAdded, setJustAdded] = useState(false)
  const [bump, setBump] = useState(false)

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
      sellerName: veg.sellers?.business_name || null,
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

  function bumpQty(fn) {
    fn()
    setBump(true)
    setTimeout(() => setBump(false), 350)
  }

  return (
    <div className="card overflow-hidden flex flex-col">
      <div className="relative aspect-square bg-kisan-crate/40 flex items-center justify-center">
        {veg.image_url ? (
          <img src={veg.image_url} alt={veg.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <VeggieCharacter name={veg.name} className="w-16 h-16" />        )}
        {unavailable && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="bg-kisan-ink text-white text-xs font-bold px-3 py-1 rounded-full">अनुपलब्ध</span>
          </div>
        )}
      </div>
      {/* टोकरी की कागज़ी लाइनर जैसा लहरदार किनारा — सिग्नेचर एलिमेंट */}
      <div className="scallop-edge" aria-hidden="true" />

      <div className="p-2 pt-1.5 flex flex-col gap-0.5 flex-1">
        <h3 className="font-display font-semibold text-kisan-ink text-[12.5px] leading-tight line-clamp-1">{veg.name}</h3>
        {veg.sellers?.business_name && (
          <p className="text-[9px] text-gray-400 font-semibold flex items-center gap-0.5 line-clamp-1">
            🧑‍🌾 {veg.sellers.business_name}
          </p>
        )}

        {!tiers ? (
          <p className="font-display text-kisan font-bold text-sm">
            {formatRupee(veg.price)} <span className="font-sans text-[10px] text-gray-500 font-medium">/ {veg.unit}</span>
          </p>
        ) : (
          <p className="font-display text-kisan font-bold text-sm">
            {formatRupee(selectedTier.price)}{' '}
            <span className="font-sans text-[10px] text-gray-500 font-medium">/ {selectedTier.qty} {selectedTier.unit}</span>
          </p>
        )}

        {tiers && (
          <select
            value={selectedTierIdx}
            onChange={(e) => setSelectedTierIdx(Number(e.target.value))}
            className="text-[10px] border border-kisan-crate rounded-lg px-1.5 py-1 font-semibold text-gray-600 mb-0.5"
          >
            {tiers.map((t, idx) => (
              <option key={idx} value={idx}>
                {t.qty} {t.unit} — {formatRupee(t.price)}
              </option>
            ))}
          </select>
        )}

        <div className="mt-auto pt-1">
          {!tiers ? (
            !inCartSimple ? (
              <button
                onClick={handleAddSimple}
                disabled={unavailable}
                className={`w-full py-1.5 rounded-lg font-bold text-[11px] transition-all active:scale-95 ${
                  justAdded ? 'bg-kisan-orange text-kisan-ink' : 'bg-kisan text-white'
                } disabled:opacity-40`}
              >
                {unavailable ? 'अनुपलब्ध' : 'कार्ट में डालें'}
              </button>
            ) : (
              <div className="flex items-center justify-between bg-kisan rounded-lg overflow-hidden">
                <button onClick={() => bumpQty(() => decreaseQty(veg.id))} className="text-white font-bold text-base w-7 h-7 active:bg-kisan-dark transition-colors">−</button>
                <span className={`text-white font-bold text-xs ${bump ? 'animate-bump' : ''}`}>{inCartSimple.quantity}</span>
                <button onClick={() => bumpQty(() => increaseQty(veg.id))} className="text-white font-bold text-base w-7 h-7 active:bg-kisan-dark transition-colors">+</button>
              </div>
            )
          ) : !inCartTiered ? (
            <button
              onClick={handleAddTiered}
              disabled={unavailable}
              className={`w-full py-1.5 rounded-lg font-bold text-[11px] transition-all active:scale-95 ${
                justAdded ? 'bg-kisan-orange text-kisan-ink' : 'bg-kisan text-white'
              } disabled:opacity-40`}
            >
              {unavailable ? 'अनुपलब्ध' : 'कार्ट में डालें'}
            </button>
          ) : (
            <div className="flex items-center justify-between bg-kisan rounded-lg overflow-hidden">
              <button onClick={() => bumpQty(() => decreaseQty(selectedTierCartId))} className="text-white font-bold text-base w-7 h-7 active:bg-kisan-dark transition-colors">−</button>
              <span className={`text-white font-bold text-xs ${bump ? 'animate-bump' : ''}`}>{inCartTiered.quantity}</span>
              <button onClick={() => bumpQty(() => increaseQty(selectedTierCartId))} className="text-white font-bold text-base w-7 h-7 active:bg-kisan-dark transition-colors">+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
