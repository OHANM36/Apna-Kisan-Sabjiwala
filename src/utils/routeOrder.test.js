import test from 'node:test'
import assert from 'node:assert/strict'
import { suggestStopOrder, totalLegKm } from './routeOrder.js'

const o = (id, lat, lng, extra = {}) => ({
  id, latitude: lat, longitude: lng, delivery_time_slot: 'सुबह 9 - 11 बजे', created_at: '2026-10-03T05:00:00Z', ...extra,
})
const ids = (res) => res.map((r) => r.order.id)
const me = { lat: 23.25, lng: 77.4 }

test('no origin means no suggestion', () => {
  assert.equal(suggestStopOrder([o('a', 23.26, 77.4)], null), null)
  assert.equal(suggestStopOrder([o('a', 23.26, 77.4)], { lat: NaN, lng: 1 }), null)
})

test('empty list gives empty result', () => {
  assert.deepEqual(suggestStopOrder([], me), [])
})

test('nearest first along a line, regardless of input order', () => {
  const res = suggestStopOrder([o('c', 23.28, 77.4), o('a', 23.26, 77.4), o('b', 23.27, 77.4)], me)
  assert.deepEqual(ids(res), ['a', 'b', 'c'])
  assert.deepEqual(res.map((r) => r.stop), [1, 2, 3])
  assert.ok(res[0].legKm > 1.0 && res[0].legKm < 1.2)
  assert.ok(Math.abs(totalLegKm(res) - 3.3) < 0.2)
})

test('earlier delivery slot goes first even if a later slot customer is nearer', () => {
  const res = suggestStopOrder([
    o('near-late', 23.251, 77.4, { delivery_time_slot: 'शाम 6 - 8 बजे' }),
    o('far-early', 23.30, 77.4, { delivery_time_slot: 'सुबह 7 - 9 बजे' }),
  ], me)
  assert.deepEqual(ids(res), ['far-early', 'near-late'])
})

test('earlier date goes first when delivery_date is known', () => {
  const res = suggestStopOrder([
    o('tomorrow', 23.251, 77.4, { delivery_date: '2026-10-04' }),
    o('today', 23.30, 77.4, { delivery_date: '2026-10-03' }),
  ], me)
  assert.deepEqual(ids(res), ['today', 'tomorrow'])
})

test('orders without GPS go last in their slot with no distance', () => {
  const res = suggestStopOrder([o('nogps', null, null), o('a', 23.26, 77.4), o('b', 23.27, 77.4)], me)
  assert.deepEqual(ids(res), ['a', 'b', 'nogps'])
  assert.equal(res[2].legKm, null)
})

test('2-opt avoids a longer zig-zag than the optimal path', () => {
  // दो गुच्छे: पास वाला गुच्छा पहले पूरा, फिर दूर वाला — बीच-बीच में कूदना नहीं
  const pts = [
    o('n1', 23.251, 77.40), o('f1', 23.30, 77.40), o('n2', 23.252, 77.40),
    o('f2', 23.301, 77.40), o('n3', 23.253, 77.40), o('f3', 23.302, 77.40),
  ]
  const res = suggestStopOrder(pts, me)
  assert.deepEqual(ids(res).slice(0, 3).sort(), ['n1', 'n2', 'n3'])
  assert.deepEqual(ids(res).slice(3).sort(), ['f1', 'f2', 'f3'])
})
