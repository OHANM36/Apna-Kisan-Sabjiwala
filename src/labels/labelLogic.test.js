import test from 'node:test'
import assert from 'node:assert/strict'
import {
  A4_TEMPLATES, FORMATS, templateLayout, buildLabels, paginate, sheetsRequired, normalizeBags,
  paymentBadge, shortNumber, trackUrl, labelProblems, deliveryText, addressParts, MAX_BAGS,
} from './labelLogic.js'

const ord = (id, extra = {}) => ({
  id, order_number: `AKS-20260819-${String(id).padStart(4, '0')}`, customer_name: 'राहुल शर्मा', customer_phone: '9800000000',
  full_address: 'House 1, Street', mohalla: 'Morar', city: 'Gwalior', pincode: '474006', total_amount: 356,
  payment_method: 'ऑनलाइन', payment_status: 'लंबित', ...extra,
})

test('A4 75x50 template: 2 x 5 = 10 labels, centred, fits the sheet', () => {
  const t = A4_TEMPLATES.find((x) => x.id === 'a4-75x50')
  const l = templateLayout(t)
  assert.equal(l.perSheet, 10)
  assert.equal(l.gridW, 150)
  assert.equal(l.gridH, 250)
  assert.equal(l.offsetX, 30)
  assert.equal(l.offsetY, 23.5)
  assert.ok(l.offsetX >= 5 && l.offsetY >= 5, 'printer non-printable margin respected')
})

test('every A4 template fits inside A4', () => {
  for (const t of A4_TEMPLATES) {
    const l = templateLayout(t)
    assert.ok(l.offsetX + l.gridW <= 210 && l.offsetY + l.gridH <= 297, t.id)
  }
})

test('multi order + multi bag: 1 + 3 + 2 = 6 labels with correct bag numbers', () => {
  const labels = buildLabels([ord(1001), ord(1002), ord(1003)], { 1002: 3, 1003: 2 })
  assert.equal(labels.length, 6)
  assert.deepEqual(labels.map((x) => `${x.order.id}:${x.bag}/${x.bags}`), [
    '1001:1/1', '1002:1/3', '1002:2/3', '1002:3/3', '1003:1/2', '1003:2/2',
  ])
  assert.equal(new Set(labels.map((x) => x.key)).size, 6)
})

test('bag_count on the order is the default; invalid values fall back to 1; capped', () => {
  assert.equal(buildLabels([ord(1, { bag_count: 4 })]).length, 4)
  assert.equal(normalizeBags(0), 1)
  assert.equal(normalizeBags(-3), 1)
  assert.equal(normalizeBags('abc'), 1)
  assert.equal(normalizeBags(2.9), 2)
  assert.equal(normalizeBags(9999), MAX_BAGS)
})

test('pagination: 10 labels = 1 sheet, 18 labels = 10 + 8, 25 = 3 sheets, 0 = none', () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => i)
  assert.deepEqual(paginate(mk(10), 10).map((p) => p.length), [10])
  assert.deepEqual(paginate(mk(18), 10).map((p) => p.length), [10, 8])
  assert.deepEqual(paginate(mk(25), 10).map((p) => p.length), [10, 10, 5])
  assert.deepEqual(paginate([], 10), [])
  assert.equal(sheetsRequired(13, 10), 2)
  assert.equal(sheetsRequired(0, 10), 0)
})

test('15 orders with 18 bags = 18 labels = 2 A4 sheets', () => {
  const orders = Array.from({ length: 15 }, (_, i) => ord(i + 1))
  const labels = buildLabels(orders, { 1: 2, 2: 2, 3: 2 })
  assert.equal(labels.length, 18)
  assert.equal(sheetsRequired(labels.length, 10), 2)
})

test('payment badge: COD unpaid shows amount, paid shows PAID, online pending is UNPAID', () => {
  assert.equal(paymentBadge(ord(1, { payment_method: 'COD' })).headline, 'COD ₹356')
  assert.equal(paymentBadge(ord(1, { payment_method: 'COD', cod_pay_mode: 'online' })).note, 'COLLECT (UPI)')
  assert.equal(paymentBadge(ord(1, { payment_method: 'COD', payment_status: 'सफल' })).headline, 'PAID')
  assert.equal(paymentBadge(ord(1, { payment_status: 'सफल' })).kind, 'paid')
  assert.equal(paymentBadge(ord(1)).kind, 'unpaid')
  assert.equal(paymentBadge(ord(1, { total_amount: 99.5 })).headline, 'UNPAID ₹99.50')
})

test('order number display, QR url and missing-data checks', () => {
  assert.equal(shortNumber('AKS-20260819-0004'), '#0004')
  const url = trackUrl('https://aks.example.com/', ord(4))
  assert.equal(url, 'https://aks.example.com/delivery?o=AKS-20260819-0004')
  assert.ok(!/token|key|admin|uuid/i.test(url))
  assert.deepEqual(labelProblems(ord(1)), [])
  assert.deepEqual(labelProblems(ord(1, { customer_name: ' ', pincode: '' })), ['नाम', 'पिनकोड'])
})

test('delivery text and address parts never invent data', () => {
  assert.equal(deliveryText(ord(1, { delivery_date: '2026-10-05', delivery_time_slot: 'दोपहर 12 - 2 बजे' })), '05 Oct | दोपहर 12 - 2 बजे')
  assert.equal(deliveryText(ord(1)), '')
  assert.deepEqual(addressParts(ord(1, { mohalla: null })), { area: '', street: 'House 1, Street', cityPin: 'Gwalior - 474006' })
})

test('format list contains the five required print formats', () => {
  assert.deepEqual(FORMATS.map((f) => f.id), ['a4', 'l75x50', 'l100x75', 't58', 't80'])
})
