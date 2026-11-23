import test from 'node:test'
import assert from 'node:assert/strict'
import { FORMAT, RECOVERY_KEY, snapshot, availableApps, createBackup, parseBackup, importBackup, restoreRecovery } from './backup.js'

function storage(values = {}) {
  const map = new Map(Object.entries(values))
  return { map, getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) }
}
const chess = { days: { '2026-11-22': { done: 3, clean: 2, missed: 1, seconds: 80 } }, sets: {}, review: [], coins: 30, petXp: { cat: 430 }, decorPos: { desk: { x: 45, y: 72 } }, alphaArchive: { sets: {}, runs: {}, review: [], parts: {}, days: {} } }
const math = { results: { 'prealgebra/1/1': { correct: 8, total: 10, pct: 80, at: 123 } }, learned: { lesson: true }, rounds: { round: 2 }, completedAttempts: { round: 'token-1' }, attempts: [{ itemId: 'round', correct: 8, total: 10, pct: 80, at: 123 }] }
const drafts = { 'prealgebra/1/1': { version: 1, kind: 'quiz', token: 'token-2', questions: [{ id: 'q1', fingerprint: 'abc' }], answers: [{ type: 'input', value: '3/4' }], inputs: ['3/4'], index: 0, round: 2, done: false, flags: [0], left: 0, updatedAt: 123 } }
const rawValues = { 'mathquest.v1': JSON.stringify(math, null, 2), 'mathquest.attempts.v1': JSON.stringify(drafts), 'training5334.v1': JSON.stringify(chess) }

test('full backup preserves exact raw math progress, drafts, and chess state without credentials', () => {
  const source = storage({ ...rawValues, 'mathquest.sync.v1': '{"code":"never-export"}', 'training5334.before-book.v1': '{}' })
  const file = createBackup(source)
  assert(!file.includes('never-export'))
  assert(!file.includes('before-book'))
  const parsed = parseBackup(file)
  assert.deepEqual(parsed.values, rawValues)
  assert.deepEqual(parsed.apps, ['math','chess'])
  const destination = storage()
  importBackup(destination, file, ['math','chess'], snapshot(destination))
  for (const [key, value] of Object.entries(rawValues)) assert.equal(destination.getItem(key), value)
  assert.equal(destination.getItem('mathquest.sync.v1'), null)
})

test('only explicitly selected application is replaced; exact prior raw data is recoverable', () => {
  const originalChess = JSON.stringify({ ...chess, coins: 999 })
  const target = storage({ ...rawValues, 'training5334.v1': originalChess, 'mathquest.sync.v1': 'kept' })
  const oldMath = JSON.stringify({ learned: { previous: true } })
  target.setItem('mathquest.v1', oldMath)
  importBackup(target, createBackup(storage(rawValues)), ['math'])
  assert.equal(target.getItem('training5334.v1'), originalChess)
  assert.equal(target.getItem('mathquest.sync.v1'), 'kept')
  const recovery = JSON.parse(target.getItem(RECOVERY_KEY))
  assert.deepEqual(Object.keys(recovery.data), ['mathquest.v1','mathquest.attempts.v1'])
  assert.equal(recovery.data['mathquest.v1'], oldMath)
  restoreRecovery(target)
  assert.equal(target.getItem('mathquest.v1'), oldMath)
  assert.equal(target.getItem('training5334.v1'), originalChess)
})

test('legacy wrapped and raw Chess saves are accepted without changing math', () => {
  for (const file of [JSON.stringify(chess), JSON.stringify({ format: '5334-training-save', version: 1, data: chess })]) {
    const target = storage(rawValues)
    importBackup(target, file, ['chess'])
    assert.deepEqual(JSON.parse(target.getItem('training5334.v1')), chess)
    assert.equal(target.getItem('mathquest.attempts.v1'), rawValues['mathquest.attempts.v1'])
  }
})

test('missing math draft key clears stale destination drafts and can be undone', () => {
  const source = storage({ 'mathquest.v1': '{}' }), target = storage(rawValues)
  const file = createBackup(source, ['math'])
  importBackup(target, file, ['math'])
  assert.equal(target.getItem('mathquest.attempts.v1'), null)
  restoreRecovery(target)
  assert.equal(target.getItem('mathquest.attempts.v1'), rawValues['mathquest.attempts.v1'])
})

test('recovery can restore a previously empty destination', () => {
  const target = storage()
  importBackup(target, createBackup(storage(rawValues)), ['math','chess'])
  restoreRecovery(target)
  assert.deepEqual(availableApps(snapshot(target)), [])
})

test('invalid JSON, versions, nested types and unsafe keys fail before storage writes', () => {
  const bad = [
    'broken', '{}', '[]',
    JSON.stringify({ format: FORMAT, version: 2, data: rawValues }),
    JSON.stringify({ format: FORMAT, version: 1, data: { 'mathquest.sync.v1': '{}' } }),
    JSON.stringify({ format: FORMAT, version: 1, data: { 'mathquest.v1': '{"results":[]}' } }),
    JSON.stringify({ format: FORMAT, version: 1, data: { 'mathquest.v1': '{"learned":{"a":"yes"}}' } }),
    JSON.stringify({ format: FORMAT, version: 1, data: { 'mathquest.attempts.v1': '{"draft":{"kind":"quiz"}}' } }),
    JSON.stringify({ ...chess, coins: -1 }),
    JSON.stringify({ ...chess, petXp: { cat: '100' } }),
    '{"days":{},"sets":{},"review":[],"__proto__":{}}',
  ]
  for (const file of bad) {
    const target = storage(rawValues), before = new Map(target.map)
    assert.throws(() => importBackup(target, file, ['math','chess']))
    assert.deepEqual(target.map, before)
  }
})

test('storage quota failure while making recovery copy leaves live keys untouched', () => {
  const target = storage(rawValues), before = new Map(target.map)
  target.setItem = () => { throw new Error('QuotaExceededError') }
  assert.throws(() => importBackup(target, createBackup(storage(rawValues)), ['math']), /Nothing was imported/)
  assert.deepEqual(target.map, before)
})

test('failure on a later live write rolls back every earlier live write', () => {
  const target = storage({ 'mathquest.v1': '{}', 'training5334.v1': '{}' })
  const original = target.setItem
  target.setItem = (key, value) => { if (key === 'mathquest.attempts.v1') throw new Error('Quota'); return original(key, value) }
  assert.throws(() => importBackup(target, createBackup(storage(rawValues)), ['math','chess']), /Previous progress has been restored/)
  assert.equal(target.getItem('mathquest.v1'), '{}')
  assert.equal(target.getItem('mathquest.attempts.v1'), null)
  assert.equal(target.getItem('training5334.v1'), '{}')
  assert(target.getItem(RECOVERY_KEY))
})

test('rollback failure is reported explicitly and supplies the raw recovery values', () => {
  const target = storage({ 'mathquest.v1': '{}' }), original = target.setItem
  let failed = false
  target.setItem = (key, value) => {
    if (key === 'mathquest.attempts.v1') { failed = true; throw new Error('blocked') }
    if (failed) throw new Error('blocked')
    return original(key, value)
  }
  assert.throws(() => importBackup(target, createBackup(storage(rawValues)), ['math']), error => {
    assert.match(error.message, /blocked full rollback/)
    assert.equal(error.recovery['mathquest.v1'], '{}')
    return true
  })
})

test('a change after preview blocks import rather than overwriting newer work', () => {
  const target = storage(rawValues), preview = snapshot(target)
  target.setItem('mathquest.v1', '{}')
  const before = new Map(target.map)
  assert.throws(() => importBackup(target, createBackup(storage(rawValues)), ['math'], preview), /changed since this preview/)
  assert.deepEqual(target.map, before)
})

test('accepts a real current Chess runtime snapshot including Alpha and in-progress runs', async () => {
  const originalStorage = globalThis.localStorage, originalWindow = globalThis.window
  const runtimeStore = storage()
  globalThis.localStorage = runtimeStore
  globalThis.window = new EventTarget()
  try {
    const chessRuntime = await import('../../.cache/sources/chess/src/lib/storage.js')
    const { migrateAlpha } = await import('../../.cache/sources/chess/src/lib/book.js')
    chessRuntime.addCoins(500)
    chessRuntime.buy('effects', 'starlight')
    chessRuntime.recordPuzzle({ partId: 'mate-in-one', puzzleId: 'legacy-a', clean: false, seconds: 20 })
    chessRuntime.recordSet('mate-in-one', 0, { done: 12, clean: 10, total: 12 })
    chessRuntime.saveRun('mate-in-one/1', { idx: 1, tally: [{ id: 'legacy-a', clean: false }], sig: '12:legacy-a:legacy-z' })
    migrateAlpha()
    chessRuntime.recordPuzzle({ partId: 'book-1', puzzleId: 'book-1', clean: true, seconds: 15 })
    chessRuntime.setDecorPos('desk', { x: 50, y: 65 })
    chessRuntime.setDecorDirection('desk', 'right')
    const raw = runtimeStore.getItem('training5334.v1')
    const file = createBackup(runtimeStore, ['chess'])
    const fresh = storage()
    importBackup(fresh, file, ['chess'])
    assert.equal(fresh.getItem('training5334.v1'), raw)
    // The old UI exporter remains supported alongside the unified file.
    assert.deepEqual(parseBackup(chessRuntime.exportSave()).apps, ['chess'])
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalStorage
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow
  }
})
