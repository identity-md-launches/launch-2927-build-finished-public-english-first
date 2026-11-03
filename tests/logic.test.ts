// Run: node tests/logic.test.ts (Node 24 strips the types itself)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blockFraction, decodeSettings, diffAlerts, encodeSettings, mmss, overlayUrl, roundClock, wheelState } from '../src/logic.ts'

const A = '0x1234567890abcdef1234567890abcdef12345678'

test('settings round-trip through the OBS URL', () => {
  const s = { layout: 'strip' as const, alerts: ['spin' as const, 'cheer' as const], sound: true, transparent: true, streamer: A }
  assert.deepEqual(decodeSettings(encodeSettings(s)), s)
  assert.equal(overlayUrl('https://x.ipfs.io/ipfs/abc/index.html#/', s), `https://x.ipfs.io/ipfs/abc/index.html#/overlay?${encodeSettings(s)}`)
})

test('unknown or hostile params fall back to defaults', () => {
  const d = decodeSettings('layout=evil&alerts=spin,boom&by=0xnope')
  assert.equal(d.layout, 'card')
  assert.deepEqual(d.alerts, ['spin'])
  assert.equal(d.streamer, undefined)
  assert.deepEqual(decodeSettings('alerts=none').alerts, [])
})

test('round clock counts down to the next boundary', () => {
  // configuration(): round zero starts at 1793022600, rounds last 600 s.
  const c = roundClock((1793022600 + 600 * 1169 + 84) * 1000, 1793022600, 600)
  assert.equal(c.roundIndex, 1169)
  assert.equal(c.secondsLeft, 516)
  assert.equal(mmss(c.secondsLeft), '08:36')
})

test('block fraction uses 1e9 units per block and clamps', () => {
  assert.equal(blockFraction(911286742n, 1_000_000_000n), 0.9112)
  assert.equal(blockFraction(2n * 10n ** 9n, 10n ** 9n), 1)
  assert.equal(blockFraction(5n, 0n), 0)
})

test('stale or missing telemetry reads OFFLINE, never IDLE', () => {
  const now = Date.now()
  assert.equal(wheelState(null), 'OFFLINE')
  assert.equal(wheelState({ coreStatus: 'SPINNING', freshness: 'fresh', observedAtMs: now - 5_000, nowMs: now }), 'SPINNING')
  assert.equal(wheelState({ coreStatus: 'IDLE', freshness: 'fresh', observedAtMs: now - 5_000, nowMs: now }), 'IDLE')
  assert.equal(wheelState({ coreStatus: 'SPINNING', freshness: 'fresh', observedAtMs: now - 600_000, nowMs: now }), 'OFFLINE')
  assert.equal(wheelState({ coreStatus: 'SPINNING', freshness: 'stale', nowMs: now }), 'OFFLINE')
})

test('alerts fire on changes only, and only when armed', () => {
  const base = { wheel: 'IDLE' as const, blockHeight: 10n, cheers: [] }
  assert.deepEqual(diffAlerts(null, base, ['spin']), [])
  const next = { wheel: 'SPINNING' as const, blockHeight: 11n, cheers: [{ hash: '0xaa', from: A }] }
  assert.deepEqual(diffAlerts(base, next, ['spin', 'idle', 'block', 'cheer']).map((e) => e.kind), ['spin', 'block', 'cheer'])
  assert.deepEqual(diffAlerts(base, next, ['cheer']).map((e) => e.kind), ['cheer'])
  assert.deepEqual(diffAlerts(next, { ...next, wheel: 'IDLE' }, ['idle']).map((e) => e.title), ['IDLE'])
  // OFFLINE after SPINNING is not an IDLE alert.
  assert.deepEqual(diffAlerts(next, { ...next, wheel: 'OFFLINE' }, ['idle']), [])
})

test('each source sets its own baseline: missing cheers never hold back wheel or block alerts', () => {
  const loading = { wheel: undefined, blockHeight: undefined, cheers: undefined }
  assert.deepEqual(diffAlerts(null, loading, ['spin']), [])
  // Telemetry's first answer is a baseline, not a SPINNING event.
  assert.deepEqual(diffAlerts(loading, { wheel: 'SPINNING' as const }, ['spin']), [])
  // Cheer history unavailable (undefined) while the wheel starts and a block completes.
  const a = { wheel: 'IDLE' as const, blockHeight: 10n, cheers: undefined }
  const b = { wheel: 'SPINNING' as const, blockHeight: 11n, cheers: undefined }
  assert.deepEqual(diffAlerts(a, b, ['spin', 'idle', 'block', 'cheer']).map((e) => e.kind), ['spin', 'block'])
  // Cheer history arriving late is a baseline: nothing is replayed.
  const c = { ...b, cheers: [{ hash: '0xaa', from: A }] }
  assert.deepEqual(diffAlerts(b, c, ['cheer']), [])
  assert.deepEqual(diffAlerts(c, { ...c, cheers: [{ hash: '0xbb', from: A }, ...c.cheers] }, ['cheer']).length, 1)
})
