import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  EARLY_ACTIVITIES, buildSlots, fitsOnWeekdays, isBookable, latestStartMin, monthDays, refitSlots, startsEarly, timeLabel, windowFor,
} from '../src/lib/calendar.ts'
import { ITEMS } from '../src/sections/brain/tinyAi.ts'

const NOW = new Date('2026-11-02T12:00:00Z') // Monday 7 AM Toronto
const day = (key) => monthDays({ y: +key.slice(0, 4), m: +key.slice(5, 7) }).find((d) => d.key === key)
const SAT = day('2026-11-07')
const SUN = day('2026-11-08')
const TUE = day('2026-11-03')
const starts = (d, min, early) => buildSlots(d, min, NOW, [], early).map((s) => timeLabel(s.start, 'America/Toronto'))
const slot = (a, b) => ({ start: new Date(a), end: new Date(b) })

test('early activities: runs, hikes and snowboarding on both pages', () => {
  const early = ITEMS.filter((i) => /hike|snowboard|\brun\b/i.test(i.name)).map((i) => i.id)
  assert.deepEqual(early.sort(), ['all-day-hike', 'run', 'snowboard', 'summit'])
  for (const id of early) assert.ok(startsEarly(id), id)
  const content = fs.readFileSync(path.join(import.meta.dirname, '../src/data/content.ts'), 'utf8')
  assert.match(content, /id: 'hike',\s+label: "Let's go hiking"/, 'Connect hiking option id')
  assert.ok(startsEarly('hike'))
  for (const id of ['ai-chat', 'lift', 'photo-walk', 'hi', 'ai', 'build', 'startup', '', undefined]) assert.equal(startsEarly(id), false, String(id))
  assert.ok(EARLY_ACTIVITIES.includes('trail-run') && EARLY_ACTIVITIES.includes('morning-run'))
})

test('weekend coffee starts at 9 AM, weekend hikes at 6 AM; weekdays are unchanged', () => {
  assert.equal(starts(SAT, 60, false)[0], '9:00 AM')
  assert.equal(starts(SUN, 60, false)[0], '9:00 AM')
  assert.equal(starts(SAT, 90, true)[0], '6:00 AM', 'morning run')
  assert.equal(starts(SAT, 90, true).at(-1), '8:30 PM')
  assert.deepEqual(starts(SUN, 540, true), ['6:00 AM', '6:30 AM', '7:00 AM', '7:30 AM', '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM', '10:00 AM'], '9h hike')
  assert.deepEqual(starts(SAT, 540, false), ['9:00 AM', '9:30 AM', '10:00 AM'], '9h non-early plan')
  assert.deepEqual(starts(TUE, 60, true), starts(TUE, 60, false))
  assert.equal(starts(TUE, 60, true)[0], '7:00 PM')
  assert.deepEqual(starts(TUE, 540, true), [], 'no weekday hikes')
  assert.equal(fitsOnWeekdays(180), true)
  assert.equal(fitsOnWeekdays(240), false)
  assert.equal(windowFor(6, true).startMin, 360)
  assert.equal(windowFor(6, false).startMin, 540)
  assert.equal(windowFor(2, true).startMin, 1140)
  assert.equal(latestStartMin(540, windowFor(0, true)), 600)
})

test('isBookable mirrors the relay for early and regular activities', () => {
  const sat6 = Date.parse('2026-11-07T11:00:00Z')
  assert.equal(isBookable(sat6, sat6 + 9 * 3600e3, true), true)
  assert.equal(isBookable(sat6, sat6 + 3600e3, false), false)
  assert.equal(isBookable(sat6 - 30 * 60e3, sat6 + 3600e3, true), false, '5:30 AM')
  const tue6 = Date.parse('2026-11-03T11:00:00Z')
  assert.equal(isBookable(tue6, tue6 + 3600e3, true), false)
  const summerSat6 = Date.parse('2027-07-17T10:00:00Z')
  assert.equal(isBookable(summerSat6, summerSat6 + 3600e3, true), true, 'EDT')
})

test('switching activity keeps the times that still fit and drops the rest', () => {
  const sat6 = slot('2026-11-07T11:00:00Z', '2026-11-07T20:00:00Z') // hike 6 AM–3 PM
  const sun10 = slot('2026-11-08T15:00:00Z', '2026-11-09T00:00:00Z') // hike 10 AM–7 PM
  const kept = refitSlots([sun10, sat6], 60, false)
  assert.deepEqual(kept.map((s) => [s.start.toISOString(), s.end.toISOString()]), [['2026-11-08T15:00:00.000Z', '2026-11-08T16:00:00.000Z']], 'hike → coffee: 6 AM goes, 10 AM becomes 1h')
  const back = refitSlots(kept, 540, true)
  assert.equal(back.length, 1, 'coffee → hike: 10 AM still fits 9h')
  assert.equal(refitSlots([slot('2026-11-07T14:00:00Z', '2026-11-07T15:00:00Z')], 540, true, [{ start: Date.parse('2026-11-07T20:00:00Z'), end: Date.parse('2026-11-07T21:00:00Z') }]).length, 0, 'longer plan runs into a busy block')
  assert.equal(refitSlots([slot('2026-11-04T00:00:00Z', '2026-11-04T01:00:00Z')], 360, true).length, 0, 'weekday evening cannot hold 6h')
})
