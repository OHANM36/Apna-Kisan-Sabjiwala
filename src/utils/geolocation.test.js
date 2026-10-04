import test from 'node:test'
import assert from 'node:assert/strict'
import { hasValidLocation } from './geolocation.js'

test('real coordinates are accepted', () => {
  assert.equal(hasValidLocation(23.2599, 77.4126), true) // भोपाल
  assert.equal(hasValidLocation(-33.86, 151.2), true)
})

test('missing location is rejected (Number(null) === 0 must not slip through)', () => {
  assert.equal(hasValidLocation(null, null), false)
  assert.equal(hasValidLocation(undefined, undefined), false)
  assert.equal(hasValidLocation(null, 77.4), false)
  assert.equal(hasValidLocation(23.2, null), false)
  assert.equal(hasValidLocation('', ''), false)
})

test('junk coordinates are rejected', () => {
  assert.equal(hasValidLocation('23.2', '77.4'), false) // टेक्स्ट नहीं चलेगा
  assert.equal(hasValidLocation(NaN, 77.4), false)
  assert.equal(hasValidLocation(Infinity, 77.4), false)
  assert.equal(hasValidLocation(91, 77.4), false)
  assert.equal(hasValidLocation(23.2, 181), false)
  assert.equal(hasValidLocation(0, 0), false)
})
