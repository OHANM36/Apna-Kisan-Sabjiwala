import test from 'node:test'
import assert from 'node:assert/strict'
import { distanceKm, formatDistanceHi } from './distance.js'

test('same point is zero distance', () => {
  assert.equal(distanceKm({ lat: 23.2599, lng: 77.4126 }, { lat: 23.2599, lng: 77.4126 }), 0)
})

test('Bhopal to Gwalior is roughly 330 km in a straight line', () => {
  const d = distanceKm({ lat: 23.2599, lng: 77.4126 }, { lat: 26.2183, lng: 78.1828 })
  assert.ok(d > 320 && d < 345, `got ${d}`)
})

test('about 1.1 km for 0.01 degree of latitude', () => {
  const d = distanceKm({ lat: 23.25, lng: 77.4 }, { lat: 23.26, lng: 77.4 })
  assert.ok(d > 1.05 && d < 1.17, `got ${d}`)
})

test('accepts numeric strings (database numeric columns)', () => {
  const d = distanceKm({ lat: '23.25', lng: '77.4' }, { lat: 23.26, lng: 77.4 })
  assert.ok(d > 1.05 && d < 1.17)
})

test('missing or invalid coordinates give null, not 0 or NaN', () => {
  assert.equal(distanceKm({ lat: 23.2, lng: 77.4 }, { lat: null, lng: null }), null)
  assert.equal(distanceKm({ lat: 23.2, lng: 77.4 }, {}), null)
  assert.equal(distanceKm(null, { lat: 1, lng: 1 }), null)
  assert.equal(distanceKm({ lat: '', lng: '' }, { lat: 1, lng: 1 }), null)
})

test('formatting: metres under 1 km, one decimal under 10 km, whole km after', () => {
  assert.equal(formatDistanceHi(0.452), '450 मी')
  assert.equal(formatDistanceHi(0.001), '10 मी')
  assert.equal(formatDistanceHi(2.43), '2.4 किमी')
  assert.equal(formatDistanceHi(15.8), '16 किमी')
  assert.equal(formatDistanceHi(null), '')
})
