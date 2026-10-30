import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { analyzeTrack, autoDifficulty, elevationGain, formatJson, groupOutings, niceName } from './import-garmin.mjs'

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
  assert.doesNotMatch(out, /2025-07-19/, 'no dates in the (public) Actions log')

  const after = read(file)
  assert.equal(after.hikes.length, before.hikes.length + 2)
  assert.deepEqual(after.hikes.slice(0, before.hikes.length), before.hikes, 'existing hikes untouched')
  const ridge = after.hikes.find((h) => h.id === 'sample-ridge')
  assert.equal(ridge.name, 'Sample Ridge')
  assert.equal(ridge.distance, 14.9)
  assert.equal(ridge.elevationGain, 931, 'Garmin CSV stats win over GPX-computed ones')
  assert.equal(ridge.profile.length, 60, 'GPX supplies the profile')
  assert.equal(ridge.garminActivityId, '1234567890')
  for (const k of ['date', 'startTime', 'start']) assert.equal(ridge[k], undefined, `no ${k} by default`)
  assert.equal(ridge.experience, '14.9 km and 931 m of climbing.')
  assert.equal(ridge.photos[0].src, '')

  assert.match(run(fixtures, '--data', file), /0 added, 0 updated, 2 unchanged/)
})

test('--with-dates opts back in to dates, start times and start points', () => {
  const file = tmpCopy()
  run(fixtures, '--data', file, '--with-dates')
  const ridge = read(file).hikes.find((h) => h.id === 'sample-ridge-2025-07-19')
  assert.equal(ridge.date, 'July 19, 2025')
  assert.equal(ridge.startTime, '2025-07-19T08:05:00')
  assert.deepEqual(ridge.start, { lat: 49.3803, lon: -123.0812 })
})

test('the committed hikes.json has no dates, start times or GPS start points', () => {
  const text = fs.readFileSync(realData, 'utf8')
  assert.doesNotMatch(text, /\b20\d\d-[01]\d-[0-3]\d/)
  for (const h of read(realData).hikes) {
    for (const k of ['date', 'startTime', 'start']) assert.equal(h[k], undefined, `${h.id}.${k}`)
  }
})

test('niceName tidies Garmin titles', () => {
  assert.equal(niceName('chapel trail', 'Sedona'), 'Chapel Trail')
  assert.equal(niceName("Devil's Bridge", 'Yavapai County'), "Devil's Bridge")
  assert.equal(niceName('Yavapai County Hiking', 'Yavapai County'), 'Yavapai County Trails')
  assert.equal(niceName('Woody Point, Bonne Bay Hiking', 'Woody Point, Bonne Bay'), 'Woody Point Trails')
  assert.equal(niceName('', 'Toronto'), 'Toronto Trails')
})

// Garmin API summaries, as written by garmin_sync.py
const act = (id, name, start, km, gain, mins, profileFrom = 100) => ({
  activityId: id, activityName: name, activityType: { typeKey: 'hiking' }, locationName: 'Caledon',
  startTimeLocal: start, startTimeGMT: start, distance: km * 1000, elevationGain: gain, maxElevation: profileFrom + gain,
  movingDuration: mins * 60, elapsedDuration: mins * 60, startLatitude: 43.8, startLongitude: -79.9,
})
function apiDir(list) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'garmin-api-'))
  fs.writeFileSync(path.join(dir, 'activities.json'), JSON.stringify(list))
  return dir
}

test('same-name same-day pieces are merged; separate same-day hikes are not', () => {
  const recs = (list) => groupOutings(list.map((a) => ({ ...a, name: a.activityName, startLocal: a.startTimeLocal, distanceKm: a.distance / 1000, elapsedSec: a.elapsedDuration })), 2)
  // fragment under --min-km
  assert.equal(recs([act(1, 'Caledon Hiking', '2026-10-25 11:00:00', 3.7, 95, 80), act(2, 'Caledon Hiking', '2026-10-25 14:00:00', 1.0, 11, 20)]).length, 1)
  // watch restarted: second piece starts 5 min after the first ended
  assert.equal(recs([act(1, 'Ridge Hiking', '2026-10-25 09:00:00', 5, 300, 60), act(2, 'Ridge Hiking', '2026-10-25 10:05:00', 4, 200, 50)]).length, 1)
  // two real hikes on one day, 2 h apart
  assert.equal(recs([act(1, 'Sedona Hiking', '2026-10-10 06:00:00', 8, 150, 90), act(2, 'Sedona Hiking', '2026-10-10 09:30:00', 3, 190, 60)]).length, 2)
  // different days or names never merge
  assert.equal(recs([act(1, 'A Hiking', '2026-10-10 06:00:00', 1, 1, 10), act(2, 'A Hiking', '2026-10-11 06:00:00', 5, 1, 60), act(3, 'B Hiking', '2026-10-11 07:01:00', 1, 1, 10)]).length, 3)
})

test('merged outing: one hike, summed stats, both IDs; re-import and partial windows change nothing', () => {
  const file = tmpCopy()
  const a = act(11, 'Caledon Hiking', '2026-10-25 11:49:51', 3.72, 95, 45)
  const b = act(12, 'Caledon Hiking', '2026-10-25 14:16:41', 1.03, 11, 10)
  const out = run(apiDir([a, b]), '--data', file, '--min-km', '2')
  assert.match(out, /1 added/)
  assert.match(out, /2 merged/)
  const hike = read(file).hikes.at(-1)
  assert.equal(hike.name, 'Caledon Trails')
  assert.equal(hike.location, 'Caledon, Ontario, Canada', 'reuses the full location already on the site')
  assert.equal(hike.distance, 4.8)
  assert.equal(hike.elevationGain, 106)
  assert.equal(hike.movingTime, 55 * 60)
  assert.deepEqual(hike.garminActivityIds, ['11', '12'])
  for (const k of ['date', 'startTime', 'start']) assert.equal(hike[k], undefined)

  const text = fs.readFileSync(file, 'utf8')
  assert.match(run(apiDir([a, b]), '--data', file, '--min-km', '2'), /0 added, 0 updated, 1 unchanged/)
  assert.match(run(apiDir([b]), '--data', file), /0 added, 0 updated, 1 unchanged/, 'only one piece in the window: leave the merged stats alone')
  assert.equal(fs.readFileSync(file, 'utf8'), text)
})

test('pieces already curated as separate hikes stay separate, and edits survive', () => {
  const file = tmpCopy()
  const a = act(21, 'Test Cove Hiking', '2026-09-08 11:08:36', 5.36, 62, 33)
  const b = act(22, 'Test Cove Hiking', '2026-09-08 13:12:42', 1.53, 100, 25)
  run(apiDir([a]), '--data', file)
  run(apiDir([b]), '--data', file)
  const data = read(file)
  const [h1, h2] = data.hikes.slice(-2)
  assert.equal(h2.name, 'Test Cove, Round 2')
  Object.assign(h1, { name: 'My Name', location: 'My Place', experience: 'Mine.', takeaway: 'Mine too.', photos: [{ src: 'images/x.webp', alt: 'x' }] })
  fs.writeFileSync(file, formatJson(data) + '\n')
  const out = run(apiDir([a, b]), '--data', file, '--min-km', '2')
  assert.match(out, /0 added, 0 updated, 2 unchanged/)
  const again = read(file).hikes.find((h) => h.garminActivityId === '21')
  assert.equal(again.name, 'My Name')
  assert.equal(again.photos[0].src, 'images/x.webp')
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
