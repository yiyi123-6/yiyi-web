import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { analyzeTrack, autoDifficulty, elevationGain, formatJson } from './import-garmin.mjs'

const root = path.resolve(import.meta.dirname, '..')
const script = path.join(root, 'scripts/import-garmin.mjs')
const fixtures = path.join(root, 'scripts/fixtures')
const realData = path.join(root, 'src/data/hikes.json')

function tmpCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'garmin-'))
  const file = path.join(dir, 'hikes.json')
  fs.copyFileSync(realData, file)
  return file
}
const run = (...args) => execFileSync('node', [script, ...args], { cwd: root, encoding: 'utf8' })
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'))

test('formatJson round-trips the hand-written hikes.json byte for byte', () => {
  const text = fs.readFileSync(realData, 'utf8')
  assert.equal(formatJson(JSON.parse(text)) + '\n', text)
})

test('hysteresis ignores jitter but counts real climbs', () => {
  assert.equal(elevationGain([100, 101, 100, 102, 100, 101]), 0)
  assert.equal(elevationGain([100, 150, 120, 200]), 130)
})

test('GPX track analysis', () => {
  const pts = Array.from({ length: 11 }, (_, i) => ({ lat: 49 + i * 0.001, lon: -123, ele: 100 + i * 10, time: new Date(Date.UTC(2025, 0, 1, 10, i)).toISOString() }))
  const t = analyzeTrack(pts)
  assert.ok(Math.abs(t.distanceM - 1112) < 5)
  assert.ok(t.elevationGainM > 85 && t.elevationGainM <= 100)
  assert.equal(t.elapsedSec, 600)
  assert.equal(t.profile.length, 60)
})

test('autoDifficulty scales with effort', () => {
  assert.equal(autoDifficulty(4, 50), 'Easy')
  assert.equal(autoDifficulty(10, 400), 'Moderate')
  assert.equal(autoDifficulty(15, 900), 'Hard')
  assert.equal(autoDifficulty(24, 1500, 9 * 3600), 'Epic')
})

test('imports CSV + GPX into a copy, merges the duplicate, filters runs, is idempotent', () => {
  const file = tmpCopy()
  const before = read(file)
  const out = run(fixtures, '--data', file)
  assert.match(out, /2 added, 0 updated/)
  assert.match(out, /type "running" is not a hike/)

  const after = read(file)
  assert.equal(after.hikes.length, before.hikes.length + 2)
  assert.deepEqual(after.hikes.slice(0, before.hikes.length), before.hikes, 'existing hikes untouched')
  const ridge = after.hikes.find((h) => h.id === 'sample-ridge-hiking-2025-07-19')
  assert.equal(ridge.distance, 14.9)
  assert.equal(ridge.elevationGain, 931, 'Garmin CSV stats win over GPX-computed ones')
  assert.equal(ridge.profile.length, 60, 'GPX supplies the profile')
  assert.equal(ridge.garminActivityId, '1234567890')
  assert.equal(ridge.date, 'July 19, 2025')

  assert.match(run(fixtures, '--data', file), /0 added, 0 updated, 2 unchanged/)
})

test('--as attaches a GPX to an existing hike without touching hand-written fields', () => {
  const file = tmpCopy()
  const before = read(file).hikes.find((h) => h.id === 'niagara')
  run(path.join(fixtures, 'activity_1234567890.gpx'), '--data', file, '--as', 'niagara')
  const after = read(file).hikes.find((h) => h.id === 'niagara')
  for (const k of ['name', 'location', 'photos', 'experience', 'takeaway', 'difficulty']) assert.deepEqual(after[k], before[k], k)
  assert.equal(after.distance, 14.9)
  assert.equal(after.profile.length, 60)
  assert.ok(after.movingTime > 7 * 3600)
})

test('--dry-run writes nothing', () => {
  const file = tmpCopy()
  const text = fs.readFileSync(file, 'utf8')
  run(fixtures, '--data', file, '--dry-run')
  assert.equal(fs.readFileSync(file, 'utf8'), text)
})
