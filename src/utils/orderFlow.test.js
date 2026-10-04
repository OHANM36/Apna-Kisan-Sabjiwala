import test from 'node:test'
import assert from 'node:assert/strict'
import {
  S, nextAction, canCancel, isFinal, adminAllowedTransitions, buildCancelReason, CANCEL_REASONS,
  isPaidOnline, refundRequired, describeStatusError,
} from './orderFlow.js'

const ALL = Object.values(S)

test('spec matrix: exactly the allowed admin transitions, nothing else', () => {
  const expected = {
    [S.NEW]: [S.ACCEPTED, S.CANCELLED],
    [S.PAID]: [S.ACCEPTED, S.CANCELLED],
    [S.ACCEPTED]: [S.PREPARING, S.CANCELLED],
    [S.PREPARING]: [S.OUT, S.CANCELLED],
    [S.OUT]: [S.DELIVERED],
    [S.DELIVERED]: [],
    [S.CANCELLED]: [],
  }
  for (const s of ALL) assert.deepEqual(adminAllowedTransitions(s).sort(), expected[s].sort(), s)
})

test('never offers a backwards move', () => {
  const order = [S.NEW, S.PAID, S.ACCEPTED, S.PREPARING, S.OUT, S.DELIVERED]
  for (const s of order) {
    const nxt = nextAction(s)
    if (nxt) assert.ok(order.indexOf(nxt.status) > order.indexOf(s), `${s} → ${nxt.status}`)
  }
})

test('cancel allowed only before Out for Delivery', () => {
  assert.equal(canCancel(S.NEW), true)
  assert.equal(canCancel(S.PAID), true)
  assert.equal(canCancel(S.ACCEPTED), true)
  assert.equal(canCancel(S.PREPARING), true)
  assert.equal(canCancel(S.OUT), false)
  assert.equal(canCancel(S.DELIVERED), false)
  assert.equal(canCancel(S.CANCELLED), false)
})

test('final states have no controls', () => {
  for (const s of [S.DELIVERED, S.CANCELLED]) {
    assert.equal(isFinal(s), true)
    assert.equal(nextAction(s), null)
    assert.equal(canCancel(s), false)
  }
})

test('cancel reason: required, "other" needs text', () => {
  assert.equal(buildCancelReason(null, ''), null)
  assert.equal(buildCancelReason('अन्य', '   '), null)
  assert.equal(buildCancelReason('अन्य', ' ग्राहक बाहर है '), 'अन्य: ग्राहक बाहर है')
  assert.equal(buildCancelReason(CANCEL_REASONS[1], ''), CANCEL_REASONS[1])
  assert.equal(buildCancelReason('अन्य', 'क'.repeat(900)).length, 500)
})

test('paid online order: payment stays paid, refund flagged — never auto-refunded', () => {
  const paid = { payment_method: 'ऑनलाइन', payment_status: 'सफल', order_status: S.CANCELLED }
  assert.equal(isPaidOnline(paid), true)
  assert.equal(refundRequired(paid), true)
  assert.equal(refundRequired({ ...paid, payment_status: 'लंबित' }), false)
  assert.equal(refundRequired({ ...paid, payment_status: 'रिफंड' }), false)
  assert.equal(refundRequired({ ...paid, payment_method: 'COD' }), false)
  assert.equal(refundRequired({ ...paid, order_status: S.ACCEPTED }), false)
})

test('error messages are specific', () => {
  assert.match(describeStatusError(new Error('INVALID_TRANSITION')), /अनुमत नहीं/)
  assert.match(describeStatusError(new Error('CANCEL_REASON_REQUIRED')), /कारण/)
  assert.match(describeStatusError(new Error('UNAUTHORIZED')), /अनुमति/)
  assert.match(describeStatusError(new TypeError('Failed to fetch')), /इंटरनेट/)
  assert.match(describeStatusError(new Error('boom')), /दोबारा कोशिश/)
})
