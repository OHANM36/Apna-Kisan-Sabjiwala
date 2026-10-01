import test from 'node:test'
import assert from 'node:assert/strict'
import { syncCartWithCatalog } from './cartSync.js'

const catalog = [
  { id: 'v1', price: 42, price_tiers: [{ qty: 1, unit: 'किलो', price: 42 }, { qty: 500, unit: 'ग्राम', price: 21 }], is_active: true },
  { id: 'v2', price: 26, price_tiers: null, is_active: true },
  { id: 'v3', price: 10, price_tiers: null, is_active: false },
]

test('stale simple line gets the newly published price', () => {
  const r = syncCartWithCatalog([{ id: 'v2', vegetableId: 'v2', name: 'आलू', price: 25, quantity: 2 }], catalog)
  assert.equal(r.items[0].price, 26)
  assert.deepEqual(r.changed, [{ id: 'v2', name: 'आलू', from: 25, to: 26 }])
})

test('tier lines follow their tier price; unchanged lines are untouched', () => {
  const lines = [
    { id: 'v1::500-ग्राम', vegetableId: 'v1', name: 'टमाटर', price: 17, quantity: 1 },
    { id: 'v1::1-किलो', vegetableId: 'v1', name: 'टमाटर', price: 42, quantity: 1 },
  ]
  const r = syncCartWithCatalog(lines, catalog)
  assert.equal(r.items[0].price, 21)
  assert.equal(r.items[1], lines[1])
  assert.equal(r.changed.length, 1)
})

test('removed/inactive vegetables and vanished tiers leave the cart with a notice', () => {
  const r = syncCartWithCatalog(
    [
      { id: 'v3', vegetableId: 'v3', name: 'X', price: 10, quantity: 1 },
      { id: 'gone', vegetableId: 'gone', name: 'Y', price: 10, quantity: 1 },
      { id: 'v1::250-ग्राम', vegetableId: 'v1', name: 'Z', price: 11, quantity: 1 },
    ],
    catalog
  )
  assert.equal(r.items.length, 0)
  assert.deepEqual(r.removed.map((x) => x.name), ['X', 'Y', 'Z'])
})

test('empty/undefined inputs are safe', () => {
  assert.deepEqual(syncCartWithCatalog(undefined, undefined), { items: [], changed: [], removed: [] })
})
