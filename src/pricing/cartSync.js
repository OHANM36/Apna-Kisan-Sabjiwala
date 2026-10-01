// कार्ट की कीमतें ताज़ा प्रकाशित कीमतों से मिलाना.
// मालिक के नई कीमतें पब्लिश करने के बाद पुराने कार्ट में पुरानी कीमत न रह जाए (और पुरानी कीमत पर ऑर्डर न बने).
// शुद्ध फ़ंक्शन — नेटवर्क CartContext में होता है।

import { round2 } from './engine.js'

function tierKeyFromLineId(id) {
  const i = String(id).indexOf('::')
  return i === -1 ? null : String(id).slice(i + 2)
}

/**
 * items: कार्ट लाइनें; catalog: [{ id, price, price_tiers, is_active }]
 * लौटाता है { items, changed:[{id,name,from,to}], removed:[{id,name}] }
 */
export function syncCartWithCatalog(items, catalog) {
  const byId = new Map((catalog || []).map((v) => [v.id, v]))
  const out = []
  const changed = []
  const removed = []
  for (const line of items || []) {
    const veg = byId.get(line.vegetableId || line.id)
    if (!veg || veg.is_active === false) {
      removed.push({ id: line.id, name: line.name })
      continue
    }
    const tierKey = tierKeyFromLineId(line.id)
    let price
    if (tierKey) {
      const tiers = Array.isArray(veg.price_tiers) ? veg.price_tiers : []
      const tier = tiers.find((t) => `${t.qty}-${t.unit}` === tierKey)
      if (!tier) {
        removed.push({ id: line.id, name: line.name })
        continue
      }
      price = Number(tier.price)
    } else {
      price = Number(veg.price)
    }
    if (!Number.isFinite(price) || price <= 0) {
      removed.push({ id: line.id, name: line.name })
      continue
    }
    if (round2(price) !== round2(Number(line.price))) {
      changed.push({ id: line.id, name: line.name, from: Number(line.price), to: price })
      out.push({ ...line, price })
    } else {
      out.push(line)
    }
  }
  return { items: out, changed, removed }
}
