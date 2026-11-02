import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

const source = fs.readFileSync(path.join(import.meta.dirname, 'invite-relay.gs'), 'utf8')
const HOUR = 3600e3
const DAY = 24 * HOUR
const NOW = Date.parse('2026-11-02T12:00:00Z') // Monday, 7:00 AM in Toronto

/** Enough of Utilities.formatDate's Java patterns for the script. */
function formatDate(date, tz, pattern) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short', timeZoneName: 'short',
  }).formatToParts(date).map((x) => [x.type, x.value]))
  if (pattern === "yyyy-MM-dd'T'HH:mm:ss") return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`
  if (pattern === 'yyyyMMdd') return `${p.year}${p.month}${p.day}`
  return `${p.weekday} ${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} ${p.timeZoneName}`
}

/** Loads invite-relay.gs into a sandbox with fake Apps Script services. */
function load({ freeBusy = { primary: { busy: [] } }, now = NOW, props = {}, ics = {} } = {}) {
  const store = { mail: [], events: [], props: { ...props }, cache: {}, fetches: [], icsFetches: [], logs: [], triggers: [], formatCalls: 0 }
  const makeEvent = (title, start, end, opts = {}) => {
    const ev = {
      id: `ev${store.events.length + 1}@google.com`, title, start, end, opts, color: null, deleted: false,
      getId: () => ev.id, getDescription: () => opts.description || '', setColor: (c) => { ev.color = c },
      deleteEvent: () => { ev.deleted = true },
    }
    store.events.push(ev)
    return ev
  }
  const calendar = {
    createEvent: makeEvent,
    getEventById: (id) => store.events.find((e) => e.id === id && !e.deleted) || null,
  }
  const sandbox = {
    Date: class extends Date {
      constructor(...a) { super(...(a.length ? a : [now])) }
      static now() { return now }
    },
    JSON, Math, Object, String, Number, Array, isFinite, encodeURIComponent,
    CacheService: { getScriptCache: () => ({ get: (k) => store.cache[k] ?? null, put: (k, v) => { store.cache[k] = v } }) },
    PropertiesService: {
      getScriptProperties: () => ({
        setProperty: (k, v) => { store.props[k] = v }, getProperty: (k) => store.props[k] ?? null,
        deleteProperty: (k) => { delete store.props[k] }, getProperties: () => ({ ...store.props }),
        setProperties: (o) => { for (const [k, v] of Object.entries(o)) store.props[k] = String(v) },
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    MailApp: { sendEmail: (m) => store.mail.push(m) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'yiyitan076@gmail.com' }) },
    ScriptApp: {
      getOAuthToken: () => 'tok', getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/X/exec' }),
      getProjectTriggers: () => [...store.triggers],
      deleteTrigger: (t) => { store.triggers = store.triggers.filter((x) => x !== t) },
      newTrigger: (fn) => {
        const t = { fn, getHandlerFunction: () => fn }
        const b = {
          timeBased: () => b, everyDays: (n) => { t.everyDays = n; return b }, atHour: (h) => { t.atHour = h; return b },
          inTimezone: (z) => { t.tz = z; return b }, create: () => { store.triggers.push(t); return t },
        }
        return b
      },
    },
    Logger: { log: (m) => store.logs.push(String(m)) },
    Utilities: { getUuid: () => crypto.randomUUID(), formatDate: (...a) => { store.formatCalls++; return formatDate(...a) } },
    UrlFetchApp: {
      fetchAll: (reqs) => reqs.map((r) => sandbox.UrlFetchApp.fetch(r.url, r)),
      fetch: (url, opts) => {
        if (!url.startsWith('https://www.googleapis.com/calendar/v3/freeBusy')) {
          store.icsFetches.push(url)
          const feed = ics[url]
          if (feed instanceof Error) throw feed
          if (typeof feed === 'string') return { getResponseCode: () => 200, getContentText: () => feed }
          return { getResponseCode: () => feed?.code ?? 404, getContentText: () => feed?.text ?? 'Not Found' }
        }
        const body = JSON.parse(opts.payload)
        store.fetches.push({ url, body })
        // Like the real API: only busy blocks inside [timeMin, timeMax) come back.
        const lo = Date.parse(body.timeMin), hi = Date.parse(body.timeMax)
        const cals = Object.fromEntries(Object.entries(freeBusy).map(([id, c]) => [id, {
          ...c, busy: (c.busy || []).filter((b) => Date.parse(b.start) < hi && Date.parse(b.end) > lo),
        }]))
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ calendars: cals }) }
      },
    },
    CalendarApp: { getDefaultCalendar: () => calendar, getCalendarById: () => null, GuestStatus: { NO: 'NO' } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType: () => ({ body: JSON.parse(s) }) }) },
    HtmlService: { createHtmlOutput: (h) => ({ html: h, setTitle() { return this }, addMetaTag() { return this } }) },
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox)
  return { gs: sandbox, store, now }
}

const post = (gs, body) => gs.doPost({ postData: { contents: JSON.stringify(body) } }).body
const iso = (ms) => new Date(ms).toISOString()
const slot = (start, end) => ({ start, end })
const params = (u) => Object.fromEntries(new URL(u).searchParams)
const linksIn = (body) => [...body.matchAll(/https:\/\/script\.google\.com\S+/g)].map((m) => m[0])

// Saturday Nov 7 and Sunday Nov 8, 2026 (EST, UTC-5)
const SAT_10 = '2026-11-07T15:00:00.000Z'
const SAT_11 = '2026-11-07T16:00:00.000Z'
const SAT_14 = '2026-11-07T19:00:00.000Z'
const SAT_15 = '2026-11-07T20:00:00.000Z'
const SUN_10 = '2026-11-08T15:00:00.000Z'
const SUN_11 = '2026-11-08T16:00:00.000Z'
const base = { subject: "Let's do this: Coffee", message: 'hi!', name: 'Sam', replyTo: 'sam@example.com', source: 'Tiny AI', activity: 'Coffee chat', timeZone: 'Europe/Paris' }

test('mergeIntervals_ sorts, merges overlaps and touching blocks, drops junk', () => {
  const { gs } = load()
  const out = gs.mergeIntervals_([
    { start: 50, end: 60 }, { start: 0, end: 10 }, { start: 10, end: 20 }, { start: 15, end: 30 }, { start: 5, end: 5 }, { start: NaN, end: 9 },
  ])
  assert.deepEqual(JSON.parse(JSON.stringify(out)), [{ start: 0, end: 30 }, { start: 50, end: 60 }])
})

test('overlapsAny_ treats intervals as half-open', () => {
  const { gs } = load()
  const busy = [{ start: 10, end: 20 }]
  assert.equal(gs.overlapsAny_(0, 10, busy), false)
  assert.equal(gs.overlapsAny_(20, 30, busy), false)
  assert.equal(gs.overlapsAny_(19, 25, busy), true)
  assert.equal(gs.overlapsAny_(0, 100, busy), true)
})

test('parseIso_ needs an explicit offset', () => {
  const { gs } = load()
  assert.equal(gs.parseIso_('2026-11-14T14:00:00.000Z'), Date.parse('2026-11-14T14:00:00Z'))
  assert.equal(gs.parseIso_('2026-11-14T09:00-05:00'), Date.parse('2026-11-14T14:00:00Z'))
  assert.ok(Number.isNaN(gs.parseIso_('2026-11-14 09:00')))
  assert.ok(Number.isNaN(gs.parseIso_(12345)))
})

test('bookable windows: weekdays 19:00–22:00, weekends 9:00–22:00 Toronto, DST-aware', () => {
  const { gs } = load()
  const w = (a, b) => gs.bookingProblem_(Date.parse(a), Date.parse(b))
  assert.equal(w('2026-11-03T11:00:00Z', '2026-11-03T12:00:00Z'), 'work', 'Tue 6–7 AM')
  assert.equal(w('2026-11-03T13:00:00Z', '2026-11-03T14:00:00Z'), 'work', 'Tue 8–9 AM')
  assert.equal(w('2026-11-03T23:30:00Z', '2026-11-04T00:30:00Z'), 'work', 'Tue 6:30–7:30 PM')
  assert.equal(w('2026-11-04T00:00:00Z', '2026-11-04T03:00:00Z'), null, 'Tue 7–10 PM')
  assert.equal(w('2026-11-04T02:30:00Z', '2026-11-04T03:30:00Z'), 'hours', 'Tue 9:30–10:30 PM runs past 10')
  assert.equal(w('2026-11-07T13:00:00Z', '2026-11-07T14:00:00Z'), 'hours', 'Sat 8–9 AM is too early')
  assert.equal(w('2026-11-07T11:00:00Z', '2026-11-07T20:00:00Z'), 'hours', 'Sat 6 AM 9h hike is too early now')
  assert.equal(w('2026-11-07T13:30:00Z', '2026-11-07T22:30:00Z'), 'hours', 'Sat 8:30 AM 9h hike')
  assert.equal(w('2026-11-07T14:00:00Z', '2026-11-07T23:00:00Z'), null, 'Sat 9 AM–6 PM (9h hike)')
  assert.equal(w('2026-11-08T15:00:00Z', '2026-11-09T00:00:00Z'), null, 'Sun 10 AM–7 PM (9h hike)')
  assert.equal(w('2026-11-07T14:00:00Z', '2026-11-08T02:00:00Z'), null, 'Sat 9 AM–9 PM (12h)')
  assert.equal(w('2026-11-08T02:00:00Z', '2026-11-08T03:00:00Z'), null, 'Sat 9–10 PM')
  assert.equal(w('2026-11-08T02:30:00Z', '2026-11-08T03:30:00Z'), 'hours', 'Sat 9:30–10:30 PM')
  assert.equal(w('2026-11-09T01:00:00Z', '2026-11-09T11:00:00Z'), 'hours', 'Sun 8 PM → Mon 6 AM')
  assert.equal(w('2027-07-13T23:00:00Z', '2027-07-14T00:00:00Z'), null, 'summer Tue 7–8 PM EDT')
  assert.equal(w('2027-07-13T22:30:00Z', '2027-07-13T23:00:00Z'), 'work', 'summer Tue 6:30–7 PM EDT')
  assert.equal(w('2027-07-17T13:00:00Z', '2027-07-17T22:00:00Z'), null, 'summer Sat 9 AM EDT 9h hike')
  assert.equal(w('2027-07-17T12:30:00Z', '2027-07-17T13:30:00Z'), 'hours', 'summer Sat 8:30 AM EDT')
  assert.equal(w('2027-03-14T13:00:00Z', '2027-03-14T22:00:00Z'), null, 'Sun 9 AM on the day DST starts')
  assert.equal(gs.CONFIG.BOOKABLE_HOURS.length, 7)
})

test('BOOKABLE_HOURS and EARLY_ACTIVITIES match src/lib/calendar.ts', () => {
  const { gs } = load()
  const ts = fs.readFileSync(path.join(import.meta.dirname, '../src/lib/calendar.ts'), 'utf8')
  const literal = (marker) => {
    const at = ts.indexOf(marker) + marker.length
    return JSON.parse(JSON.stringify(vm.runInNewContext(ts.slice(at, ts.indexOf(']', at) + 1))))
  }
  assert.deepEqual(literal('BOOKABLE_HOURS: Window[] = '), JSON.parse(JSON.stringify(gs.CONFIG.BOOKABLE_HOURS)))
  assert.deepEqual(literal('EARLY_ACTIVITIES = '), [...gs.CONFIG.EARLY_ACTIVITIES])
})

test('early weekend starts come from the relay\'s own activity list', () => {
  const { gs, now } = load()
  const v = (s, e, extra) => gs.validateRequest_({ replyTo: 'a@b.co', slots: [slot(s, e)], ...extra }, now)
  const SAT_6 = '2026-11-07T11:00:00Z'
  for (const id of ['all-day-hike', 'hike', 'summit', 'snowboard', 'run', 'trail-run', 'morning-run']) {
    assert.equal(v(SAT_6, '2026-11-07T20:00:00Z', { activityId: id }).ok, true, `${id}: Saturday 6 AM`)
  }
  assert.equal(v('2026-11-08T11:00:00Z', '2026-11-08T12:30:00Z', { activityId: 'run' }).ok, true, 'run: Sunday 6 AM')
  assert.equal(v('2026-11-07T10:30:00Z', '2026-11-07T11:30:00Z', { activityId: 'run' }).code, 'hours', 'run: 5:30 AM is still too early')
  assert.equal(v('2026-11-07T11:00:00Z', '2026-11-07T23:00:00Z', { activityId: 'all-day-hike' }).ok, true, '12h hike 6 AM–6 PM')
  const coffee = v(SAT_6, '2026-11-07T12:00:00Z', { activityId: 'hi' })
  assert.equal(coffee.code, 'hours', 'coffee: Saturday 6 AM')
  assert.match(coffee.message, /weekends 9 AM–10 PM/)
  assert.match(v('2026-11-07T10:30:00Z', '2026-11-07T11:30:00Z', { activityId: 'hike' }).message, /weekends 6 AM–10 PM/)
  assert.equal(v(SAT_6, '2026-11-07T12:00:00Z', { activityId: 'unknown' }).code, 'hours', 'unknown id → 9 AM')
  assert.equal(v(SAT_6, '2026-11-07T12:00:00Z', {}).code, 'hours', 'no id → 9 AM')
  assert.equal(v(SAT_6, '2026-11-07T12:00:00Z', { activityId: 'hi', early: true, earlyStart: true }).code, 'hours', 'client booleans are ignored')
  assert.equal(v(SAT_6, '2026-11-07T12:00:00Z', { activityId: ['hike'] }).code, 'hours', 'only a plain id string counts')
  assert.equal(v('2026-11-03T11:00:00Z', '2026-11-03T20:00:00Z', { activityId: 'all-day-hike' }).code, 'work', 'weekdays are unchanged for hikes')
  const early = post(load().gs, { ...base, activityId: 'hike', activity: 'Hike', slots: [slot(SAT_6, '2026-11-07T17:00:00Z')] })
  assert.equal(early.success, true, 'POST: hike at Saturday 6 AM')
  assert.equal(post(load().gs, { ...base, activityId: 'ai', slots: [slot(SAT_6, '2026-11-07T12:00:00Z')] }).code, 'hours', 'POST: AI chat at Saturday 6 AM')
})

test('clampWindow_: never before now, ≤ 62 days per query, ≤ 2 years ahead', () => {
  const { gs, now } = load()
  const a = gs.clampWindow_(iso(now - DAY), iso(now + 10 * DAY), now)
  assert.equal(a.from, now)
  const far = gs.clampWindow_(iso(now + 300 * DAY), iso(now + 400 * DAY), now)
  assert.equal(far.from, now + 300 * DAY, 'any month in the future can be queried')
  assert.equal(far.to - far.from, 62 * DAY)
  assert.equal(gs.clampWindow_(iso(now + 800 * DAY), iso(now + 830 * DAY), now), null)
  assert.equal(gs.clampWindow_(iso(now + 5 * DAY), iso(now + 2 * DAY), now), null)
})

test('validateRequest_ rules', () => {
  const { gs, now } = load()
  const one = (s, e, extra = {}) => gs.validateRequest_({ replyTo: 'a@b.co', slots: [slot(s, e)], ...extra }, now)
  assert.equal(one(SAT_10, SAT_11).timed, true)
  assert.equal(gs.validateRequest_({ subject: 'hi' }, now).timed, false)
  assert.equal(gs.validateRequest_({ replyTo: 'a@b.co', slots: [] }, now).timed, false)
  assert.equal(one(iso(now + 10 * 60e3), iso(now + HOUR)).ok, false, 'needs lead time')
  assert.equal(one('2026-11-07T11:00:00Z', '2026-11-08T00:00:00Z').ok, false, 'max 12h')
  assert.equal(one(SAT_10, SAT_10).ok, false, 'end after start')
  assert.equal(one('2028-03-04T15:00:00Z', '2028-03-04T16:00:00Z').ok, true, 'a Saturday 16 months out is fine')
  assert.equal(one('2028-11-04T15:00:00Z', '2028-11-04T16:00:00Z').ok, false, 'over 2 years')
  assert.equal(one(SAT_10, SAT_11, { replyTo: 'nope' }).ok, false, 'email required for timed')
  assert.equal(one('tomorrow', SAT_11).ok, false)
  const work = one('2026-11-03T15:00:00Z', '2026-11-03T16:00:00Z')
  assert.equal(work.ok, false)
  assert.equal(work.code, 'work', 'weekday 10 AM is work hours')
  assert.equal(one('2026-11-03T12:00:00Z', '2026-11-03T13:00:00Z').code, 'work', 'weekday 7 AM is work hours now')
  assert.equal(one('2026-11-04T00:00:00Z', '2026-11-04T01:00:00Z').ok, true, 'weekday 7 PM is fine')
  assert.match(work.message, /weekdays 7 PM–10 PM or weekends 9 AM–10 PM \(Toronto\)/)
  const early = one('2026-11-07T13:00:00Z', '2026-11-07T14:00:00Z')
  assert.equal(early.code, 'hours', 'Saturday 8 AM is before the weekend window')
  assert.match(early.message, /weekends 9 AM–10 PM/)
  assert.equal(one('2026-11-07T14:00:00Z', '2026-11-07T15:00:00Z').ok, true, 'Saturday 9 AM is fine')
  assert.equal(one('2026-11-07T14:00:00Z', '2026-11-07T23:00:00Z').ok, true, '9h hike from Saturday 9 AM')
  assert.equal(one('2026-11-08T15:00:00Z', '2026-11-09T00:00:00Z').ok, true, '9h hike from Sunday 10 AM')
  assert.equal(one('2026-11-08T02:30:00Z', '2026-11-08T03:30:00Z').code, 'hours', 'Saturday plan past 10 PM')
  assert.equal(one(SAT_10, SAT_11, { name: 'x'.repeat(500) }).name.length, 100)
  assert.equal(one(SAT_10, SAT_11, { timeZone: '<script>' }).timeZone, '')
  assert.equal(one(SAT_10, SAT_11, { timeZone: 'America/Argentina/Buenos_Aires' }).timeZone, 'America/Argentina/Buenos_Aires')
})

test('validateRequest_ with several slots: sorted, ≤ 5, no overlaps, single start/end still works', () => {
  const { gs, now } = load()
  const v = (slots) => gs.validateRequest_({ replyTo: 'a@b.co', slots }, now)
  const ok = v([slot(SUN_10, SUN_11), slot(SAT_10, SAT_11)])
  assert.equal(ok.ok, true)
  assert.deepEqual([...ok.slots].map((s) => iso(s.start)), [SAT_10, SUN_10])
  assert.equal(v([slot(SAT_10, SAT_14), slot(SAT_11, SAT_15)]).ok, false, 'overlapping options')
  assert.equal(v([slot(SAT_10, SAT_11), slot(SAT_11, SAT_14)]).ok, true, 'back-to-back is fine')
  const six = Array.from({ length: 6 }, (_, i) => slot(iso(Date.parse(SAT_10) + i * 7 * DAY), iso(Date.parse(SAT_11) + i * 7 * DAY)))
  assert.equal(v(six).ok, false, 'max 5 options')
  assert.equal(v(six.slice(0, 5)).ok, true)
  assert.equal(v([slot(SAT_10, SAT_11), slot('2026-11-04T15:00:00Z', '2026-11-04T16:00:00Z')]).code, 'work', 'every option is checked')
  const legacy = gs.validateRequest_({ replyTo: 'a@b.co', start: SAT_10, end: SAT_11 }, now)
  assert.equal(legacy.timed, true)
  assert.equal(legacy.slots.length, 1)
})

test('availability returns merged busy blocks only, from yiyitan076 only', () => {
  const { gs, store } = load({
    freeBusy: {
      primary: { busy: [{ start: '2026-11-05T14:00:00Z', end: '2026-11-05T15:00:00Z' }, { start: '2026-11-05T14:30:00Z', end: '2026-11-05T16:00:00Z' }] },
    },
  })
  const res = gs.doGet({ parameter: { action: 'availability', from: '2026-11-02T00:00:00Z', to: '2026-12-01T00:00:00Z' } }).body
  assert.deepEqual(res.busy, [{ start: '2026-11-05T14:00:00.000Z', end: '2026-11-05T16:00:00.000Z' }])
  assert.deepEqual(res.calendarsMissing, [])
  assert.deepEqual(Object.keys(res).sort(), ['busy', 'calendarsMissing', 'icloudErrors', 'icloudSyncedAt', 'success', 'timeZone'])
  assert.equal(res.icloudErrors, 0)
  assert.equal(res.icloudSyncedAt, null)
  assert.deepEqual([...gs.CONFIG.CALENDAR_IDS], ['primary'])
  assert.deepEqual(store.fetches[0].body.items.map((i) => i.id), ['primary'])
  assert.doesNotMatch(source, /ee\.official67/, 'the second calendar is gone from the relay')
})

test('availability flags a calendar the free/busy API cannot read', () => {
  const { gs } = load({ freeBusy: { primary: { errors: [{ domain: 'global', reason: 'notFound' }], busy: [] } } })
  const res = gs.doGet({ parameter: { action: 'availability', from: '2026-11-02T00:00:00Z', to: '2026-12-01T00:00:00Z' } }).body
  assert.deepEqual(res.calendarsMissing, ['primary'])
})

test('availability for a month far ahead queries exactly that window', () => {
  const { gs, store } = load({
    freeBusy: {
      primary: { busy: [{ start: '2027-05-15T14:00:00Z', end: '2027-05-15T16:00:00Z' }] },
    },
  })
  const res = gs.doGet({ parameter: { action: 'availability', from: '2027-05-01T04:00:00Z', to: '2027-06-01T04:00:00Z' } }).body
  assert.equal(res.busy.length, 1)
  assert.equal(store.fetches[0].body.timeMin, '2027-05-01T04:00:00.000Z')
  assert.equal(store.fetches[0].body.timeMax, '2027-06-01T04:00:00.000Z')
})

test('POST rejects work hours and early weekend starts server-side', () => {
  const { gs, store } = load()
  const res = post(gs, { ...base, slots: [slot('2026-11-05T15:00:00Z', '2026-11-05T16:00:00Z')] })
  assert.equal(res.success, false)
  assert.equal(res.code, 'work')
  const early = post(gs, { ...base, slots: [slot(SAT_10, SAT_11), slot('2026-11-08T12:00:00Z', '2026-11-08T13:00:00Z')] })
  assert.equal(early.success, false, 'Sunday 7 AM')
  assert.equal(early.code, 'hours')
  assert.equal(store.events.length, 0)
  assert.equal(store.mail.length, 0)
})

test('three options: conflicts are reported, then holds + one email; accepting one removes every hold', () => {
  const { gs, store } = load({
    freeBusy: { primary: { busy: [{ start: '2026-11-08T15:30:00Z', end: '2026-11-08T17:00:00Z' }] } },
  })
  const SAT_EVE = slot('2026-11-08T00:00:00.000Z', '2026-11-08T01:00:00.000Z') // Sat 7–8 PM
  const clash = post(gs, { ...base, slots: [slot(SAT_10, SAT_11), slot(SUN_10, SUN_11), SAT_EVE] })
  assert.equal(clash.success, false)
  assert.equal(clash.code, 'conflict')
  assert.deepEqual(clash.conflicts, [SUN_10])
  assert.equal(store.events.length, 0)

  const NEXT_SAT = slot('2026-11-14T15:00:00.000Z', '2026-11-14T16:00:00.000Z')
  const ok = post(gs, { ...base, slots: [NEXT_SAT, slot(SAT_10, SAT_11), SAT_EVE] })
  assert.equal(ok.success, true)
  assert.equal(ok.options, 3)
  assert.deepEqual(store.events.map((e) => e.title), [
    '♡ Request (option 1/3): Coffee chat with Sam',
    '♡ Request (option 2/3): Coffee chat with Sam',
    '♡ Request (option 3/3): Coffee chat with Sam',
  ])
  assert.deepEqual(store.events.map((e) => iso(e.start.getTime())), [SAT_10, SAT_EVE.start, NEXT_SAT.start], 'sorted by time')
  assert.ok(store.events.every((e) => e.color === '4' && e.opts.guests === undefined), 'pink holds, visitor not invited yet')

  assert.equal(store.mail.length, 1, 'one email for all options')
  const mail = store.mail[0]
  assert.equal(mail.to, 'yiyitan076@gmail.com')
  assert.equal(mail.replyTo, 'sam@example.com')
  assert.match(mail.body, /suggested 3 times/)
  assert.match(mail.body, /Option 1: .*EST/)
  assert.match(mail.body, /Their time \(Europe\/Paris\)/)
  const links = linksIn(mail.body)
  const accepts = links.filter((u) => params(u).action === 'accept')
  const declines = links.filter((u) => params(u).action === 'decline')
  assert.equal(accepts.length, 3)
  assert.equal(declines.length, 1)
  assert.deepEqual(accepts.map((u) => params(u).option), ['1', '2', '3'])
  assert.equal((mail.htmlBody.match(/Accept this time/g) || []).length, 3)
  assert.equal((mail.htmlBody.match(/Decline all/g) || []).length, 1)

  const p = params(accepts[1])
  const page = gs.doGet({ parameter: p })
  assert.match(page.html, /Option 2 of 3/)
  assert.ok(store.events.every((e) => !e.deleted), 'opening the link alone changes nothing')
  assert.equal(gs.respondToRequest('accept', p.id, 'f'.repeat(64), 2).ok, false, 'wrong token')
  assert.equal(gs.respondToRequest('accept', p.id, p.token, 9).ok, false, 'no such option')

  const res = gs.respondToRequest('accept', p.id, p.token, Number(p.option))
  assert.equal(res.ok, true)
  assert.ok(store.events.slice(0, 3).every((e) => e.deleted), 'all holds removed')
  const confirmed = store.events[3]
  assert.equal(confirmed.title, '♡ Coffee chat with Sam')
  assert.equal(iso(confirmed.start.getTime()), SAT_EVE.start, 'option 2 = Saturday evening')
  assert.equal(confirmed.opts.guests, 'sam@example.com')
  assert.equal(confirmed.opts.sendInvites, true)
  assert.equal(gs.respondToRequest('accept', p.id, p.token, 1).ok, false, 'token is single-use')
  assert.equal(gs.respondToRequest('decline', p.id, p.token, 0).ok, false, 'other links die too')
  assert.equal(Object.keys(store.props).length, 0)
})

test('decline all deletes every hold and emails the visitor once from Yiyi', () => {
  const { gs, store } = load()
  post(gs, { ...base, name: 'Lee', replyTo: 'lee@example.com', activity: 'Hike', slots: [slot('2026-11-07T14:00:00Z', '2026-11-07T23:00:00Z'), slot('2026-11-08T14:00:00Z', '2026-11-08T23:00:00Z')] })
  assert.equal(store.events.length, 2)
  const decline = linksIn(store.mail[0].body).find((u) => params(u).action === 'decline')
  const p = params(decline)
  assert.match(gs.doGet({ parameter: p }).html, /Decline all/)
  assert.equal(gs.respondToRequest('decline', p.id, p.token, 0).ok, true)
  assert.ok(store.events.every((e) => e.deleted))
  assert.equal(store.mail.length, 2)
  const note = store.mail[1]
  assert.equal(note.to, 'lee@example.com')
  assert.equal(note.replyTo, 'yiyitan076@gmail.com')
  assert.match(note.body, /Hi Lee/)
  assert.equal((note.body.match(/  • /g) || []).length, 2, 'lists both times')
})

test('single legacy start/end still creates one hold titled without "option"', () => {
  const { gs, store } = load()
  assert.equal(post(gs, { ...base, start: SAT_10, end: SAT_11 }).success, true)
  assert.equal(store.events.length, 1)
  assert.equal(store.events[0].title, '♡ Request: Coffee chat with Sam')
  assert.match(store.mail[0].subject, /· Sat/)
})

test('untimed invite and honeypot behave like before', () => {
  const { gs, store } = load()
  assert.equal(post(gs, { subject: 'Hello', message: 'm', replyTo: 'a@b.co', source: 'Connect' }).success, true)
  assert.equal(store.mail.length, 1)
  assert.equal(store.events.length, 0)
  assert.equal(post(gs, { website: 'spam', subject: 'x' }).success, true)
  assert.equal(store.mail.length, 1)
})

test('rate limit', () => {
  const { gs, store } = load()
  store.cache.count = '30'
  assert.equal(post(gs, { subject: 'x', message: 'm' }).code, 'rate')
})

/* ───────────────────────── iCloud .ics feeds ───────────────────────── */

const vcal = (...events) => [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Apple Inc.//iCloud//EN', 'X-WR-CALNAME:Yiyi personal',
  ...events.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']),
  'END:VCALENDAR',
].join('\r\n')
const blocks = (gs, text, from, to) =>
  JSON.parse(JSON.stringify(gs.icsBusy_(text, Date.parse(from), Date.parse(to)))).map((b) => [iso(b.start), iso(b.end)])
const starts = (gs, text, from, to) => blocks(gs, text, from, to).map((b) => b[0])

test('ics: UTC, TZID and floating times; DURATION; titles never come out', () => {
  const { gs } = load()
  const text = vcal(
    ['UID:a', 'SUMMARY:Secret dentist', 'LOCATION:Somewhere private', 'DTSTART:20261110T150000Z', 'DTEND:20261110T160000Z'],
    ['UID:b', 'DTSTART;TZID=America/Los_Angeles:20261111T090000', 'DTEND;TZID=America/Los_Angeles:20261111T100000'],
    ['UID:c', 'DTSTART:20261112T090000', 'DURATION:PT1H30M'],
    ['UID:d', 'DTSTART;TZID=Asia/Tokyo:20261119T090000', 'DTEND;TZID=America/Toronto:20261118T200000'],
  )
  assert.deepEqual(blocks(gs, text, '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z'), [
    ['2026-11-10T15:00:00.000Z', '2026-11-10T16:00:00.000Z'],
    ['2026-11-11T17:00:00.000Z', '2026-11-11T18:00:00.000Z'], // PST
    ['2026-11-12T14:00:00.000Z', '2026-11-12T15:30:00.000Z'], // floating = Toronto
    ['2026-11-19T00:00:00.000Z', '2026-11-19T01:00:00.000Z'], // start and end in different zones
  ])
  assert.doesNotMatch(gs.icsMinify_(text), /Secret|private|Yiyi personal/)
})

test('ics: unfolds lines, handles CRLF/LF, quoted params, and ignores VALARM properties', () => {
  const { gs } = load()
  const text = vcal([
    'UID:fold',
    'DTSTART;TZID="America/New_York";X-APPLE-FOO=bar:20261113T19',
    ' 0000',
    'DTEND;TZID=America/New_York:2026111',
    '\t3T200000',
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'DURATION:PT5H', 'DTSTART:20261201T000000Z', 'ACTION:DISPLAY', 'END:VALARM',
  ]).replace(/\r\n(?=UID:fold)/, '\n')
  assert.deepEqual(blocks(gs, text, '2026-11-01T00:00:00Z', '2026-12-31T00:00:00Z'), [['2026-11-14T00:00:00.000Z', '2026-11-14T01:00:00.000Z']])
})

test('ics: TRANSPARENT and CANCELLED are skipped; all-day events block the whole Toronto day', () => {
  const { gs } = load()
  const text = vcal(
    ['UID:free', 'TRANSP:TRANSPARENT', 'DTSTART:20261110T150000Z', 'DTEND:20261110T160000Z'],
    ['UID:gone', 'STATUS:CANCELLED', 'DTSTART:20261111T150000Z', 'DTEND:20261111T160000Z'],
    ['UID:ok', 'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'DTSTART:20261112T150000Z', 'DTEND:20261112T160000Z'],
    ['UID:trip', 'DTSTART;VALUE=DATE:20261120', 'DTEND;VALUE=DATE:20261122'],
    ['UID:day', 'DTSTART;VALUE=DATE:20261125'],
    ['UID:summer', 'DTSTART;VALUE=DATE:20270704', 'DTEND;VALUE=DATE:20270705'],
  )
  assert.deepEqual(blocks(gs, text, '2026-11-01T00:00:00Z', '2027-08-01T00:00:00Z'), [
    ['2026-11-12T15:00:00.000Z', '2026-11-12T16:00:00.000Z'],
    ['2026-11-20T05:00:00.000Z', '2026-11-22T05:00:00.000Z'],
    ['2026-11-25T05:00:00.000Z', '2026-11-26T05:00:00.000Z'],
    ['2027-07-04T04:00:00.000Z', '2027-07-05T04:00:00.000Z'], // EDT midnight
  ])
})

test('ics: TZID names — IANA, Windows, path-prefixed, aliases; unknown falls back to Toronto', () => {
  const { gs } = load()
  assert.equal(gs.icsZone_('Pacific Standard Time'), 'America/Los_Angeles')
  assert.equal(gs.icsZone_('/mozilla.org/20050126_1/Europe/London'), 'Europe/London')
  assert.equal(gs.icsZone_('"America/Argentina/Buenos_Aires"'), 'America/Argentina/Buenos_Aires')
  assert.equal(gs.icsZone_('US/Eastern'), 'America/New_York')
  assert.equal(gs.icsZone_('GMT'), 'UTC')
  assert.equal(gs.icsZone_('Mars/Olympus_Mons'), 'America/Toronto')
  assert.equal(gs.icsZone_(''), 'America/Toronto')
  const text = vcal(
    ['UID:1', 'DTSTART;TZID=Pacific Standard Time:20261116T080000', 'DURATION:PT1H'],
    ['UID:2', 'DTSTART;TZID=/mozilla.org/20050126_1/Europe/London:20261117T090000', 'DURATION:PT1H'],
    ['UID:3', 'DTSTART;TZID=Mars/Olympus_Mons:20261118T090000', 'DURATION:PT1H'],
  )
  assert.deepEqual(starts(gs, text, '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z'), [
    '2026-11-16T16:00:00.000Z', '2026-11-17T09:00:00.000Z', '2026-11-18T14:00:00.000Z',
  ])
})

test('ics: weekly BYDAY keeps 7 PM Toronto across the fall DST change; COUNT stops it', () => {
  const { gs } = load()
  const text = vcal(['UID:w', 'DTSTART;TZID=America/Toronto:20261020T190000', 'DTEND;TZID=America/Toronto:20261020T200000', 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=6'])
  assert.deepEqual(blocks(gs, text, '2026-10-01T00:00:00Z', '2026-12-31T00:00:00Z'), [
    ['2026-10-20T23:00:00.000Z', '2026-10-21T00:00:00.000Z'], // EDT
    ['2026-10-22T23:00:00.000Z', '2026-10-23T00:00:00.000Z'],
    ['2026-10-27T23:00:00.000Z', '2026-10-28T00:00:00.000Z'],
    ['2026-10-29T23:00:00.000Z', '2026-10-30T00:00:00.000Z'],
    ['2026-11-04T00:00:00.000Z', '2026-11-04T01:00:00.000Z'], // EST after Nov 1
    ['2026-11-06T00:00:00.000Z', '2026-11-06T01:00:00.000Z'],
  ])
})

test('ics: daily 9 AM across the spring DST change; UNTIL is inclusive', () => {
  const { gs } = load()
  const text = vcal(['UID:d', 'DTSTART;TZID=America/Toronto:20270312T090000', 'DURATION:PT1H', 'RRULE:FREQ=DAILY;UNTIL=20270316T235959Z'])
  assert.deepEqual(starts(gs, text, '2027-03-01T00:00:00Z', '2027-04-01T00:00:00Z'), [
    '2027-03-12T14:00:00.000Z', '2027-03-13T14:00:00.000Z',
    '2027-03-14T13:00:00.000Z', '2027-03-15T13:00:00.000Z', '2027-03-16T13:00:00.000Z',
  ])
})

test('ics: an event spanning the fall-back hour lasts its real length; UTC series keep UTC times', () => {
  const { gs } = load()
  const text = vcal(
    ['UID:night', 'DTSTART;TZID=America/Toronto:20261101T003000', 'DTEND;TZID=America/Toronto:20261101T030000'],
    ['UID:utc', 'DTSTART:20261026T150000Z', 'DTEND:20261026T153000Z', 'RRULE:FREQ=WEEKLY;COUNT=3'],
  )
  assert.deepEqual(blocks(gs, text, '2026-10-20T00:00:00Z', '2026-12-01T00:00:00Z'), [
    ['2026-10-26T15:00:00.000Z', '2026-10-26T15:30:00.000Z'],
    ['2026-11-01T04:30:00.000Z', '2026-11-01T08:00:00.000Z'], // 00:30 EDT → 03:00 EST = 3.5h
    ['2026-11-02T15:00:00.000Z', '2026-11-02T15:30:00.000Z'],
    ['2026-11-09T15:00:00.000Z', '2026-11-09T15:30:00.000Z'],
  ])
})

test('ics: INTERVAL, and DAILY limited to weekdays', () => {
  const { gs } = load()
  const fortnight = vcal(['UID:i', 'DTSTART;TZID=America/Toronto:20261107T100000', 'DURATION:PT2H', 'RRULE:FREQ=WEEKLY;INTERVAL=2'])
  assert.deepEqual(starts(gs, fortnight, '2026-11-01T00:00:00Z', '2026-12-10T00:00:00Z'), [
    '2026-11-07T15:00:00.000Z', '2026-11-21T15:00:00.000Z', '2026-12-05T15:00:00.000Z',
  ])
  const weekdays = vcal(['UID:wd', 'DTSTART;TZID=America/Toronto:20261102T070000', 'DURATION:PT1H', 'RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR'])
  assert.deepEqual(starts(gs, weekdays, '2026-11-06T05:00:00Z', '2026-11-10T05:00:00Z'), ['2026-11-06T12:00:00.000Z', '2026-11-09T12:00:00.000Z'])
})

test('ics: MONTHLY by ordinal weekday (2MO, -1FR), BYMONTHDAY, BYSETPOS, short months skipped', () => {
  const { gs } = load()
  const range = ['2026-10-01T00:00:00Z', '2027-01-01T00:00:00Z']
  const second = vcal(['UID:m1', 'DTSTART;TZID=America/Toronto:20260112T183000', 'DURATION:PT1H', 'RRULE:FREQ=MONTHLY;BYDAY=2MO'])
  assert.deepEqual(starts(gs, second, ...range), ['2026-10-12T22:30:00.000Z', '2026-11-09T23:30:00.000Z', '2026-12-14T23:30:00.000Z'])
  const lastFri = vcal(['UID:m2', 'DTSTART:20260130T170000', 'DURATION:PT1H', 'RRULE:FREQ=MONTHLY;BYDAY=-1FR'])
  assert.deepEqual(starts(gs, lastFri, ...range), ['2026-10-30T21:00:00.000Z', '2026-11-27T22:00:00.000Z', '2026-12-25T22:00:00.000Z'])
  const lastWorkday = vcal(['UID:m3', 'DTSTART:20261030T120000Z', 'DURATION:PT1H', 'RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1'])
  assert.deepEqual(starts(gs, lastWorkday, ...range), ['2026-10-30T12:00:00.000Z', '2026-11-30T12:00:00.000Z', '2026-12-31T12:00:00.000Z'])
  const monthEnd = vcal(['UID:m4', 'DTSTART:20261130T200000Z', 'DURATION:PT1H', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1'])
  assert.deepEqual(starts(gs, monthEnd, '2026-11-01T00:00:00Z', '2027-03-01T00:00:00Z'), [
    '2026-11-30T20:00:00.000Z', '2026-12-31T20:00:00.000Z', '2027-01-31T20:00:00.000Z', '2027-02-28T20:00:00.000Z',
  ])
  const the31st = vcal(['UID:m5', 'DTSTART;VALUE=DATE:20260131', 'RRULE:FREQ=MONTHLY;COUNT=4'])
  assert.deepEqual(starts(gs, the31st, '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'), [
    '2026-01-31T05:00:00.000Z', '2026-03-31T04:00:00.000Z', '2026-05-31T04:00:00.000Z', '2026-07-31T04:00:00.000Z',
  ])
})

test('ics: YEARLY, including a Feb 29 start', () => {
  const { gs } = load()
  const july = vcal(['UID:y1', 'DTSTART;TZID=America/Toronto:20200704T120000', 'DURATION:PT2H', 'RRULE:FREQ=YEARLY'])
  assert.deepEqual(starts(gs, july, '2026-07-01T00:00:00Z', '2027-08-01T00:00:00Z'), ['2026-07-04T16:00:00.000Z', '2027-07-04T16:00:00.000Z'])
  const leap = vcal(['UID:y2', 'DTSTART;VALUE=DATE:20240229', 'RRULE:FREQ=YEARLY'])
  assert.deepEqual(starts(gs, leap, '2026-01-01T00:00:00Z', '2029-12-31T00:00:00Z'), ['2028-02-29T05:00:00.000Z'])
  const thanksgiving = vcal(['UID:y3', 'DTSTART;VALUE=DATE:20201012', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=2MO'])
  assert.deepEqual(starts(gs, thanksgiving, '2026-01-01T00:00:00Z', '2028-01-01T00:00:00Z'), ['2026-10-12T04:00:00.000Z', '2027-10-11T04:00:00.000Z'])
})

test('ics: EXDATE (TZID lists and UTC) and RECURRENCE-ID overrides (moved and cancelled)', () => {
  const { gs } = load()
  const text = vcal(
    [
      'UID:club@icloud', 'DTSTART;TZID=America/Toronto:20261104T190000', 'DTEND;TZID=America/Toronto:20261104T203000',
      'RRULE:FREQ=WEEKLY;UNTIL=20261209T235959Z',
      'EXDATE;TZID=America/Toronto:20261111T190000,20261209T190000',
      'EXDATE:20261203T000000Z',
    ],
    ['UID:club@icloud', 'RECURRENCE-ID;TZID=America/Toronto:20261118T190000', 'DTSTART;TZID=America/Toronto:20261119T200000', 'DTEND;TZID=America/Toronto:20261119T213000'],
    ['UID:club@icloud', 'RECURRENCE-ID;TZID=America/Toronto:20261125T190000', 'STATUS:CANCELLED', 'DTSTART;TZID=America/Toronto:20261125T190000', 'DTEND;TZID=America/Toronto:20261125T203000'],
  )
  assert.deepEqual(blocks(gs, text, '2026-11-01T00:00:00Z', '2027-01-01T00:00:00Z'), [
    ['2026-11-05T00:00:00.000Z', '2026-11-05T01:30:00.000Z'], // Nov 4
    ['2026-11-20T01:00:00.000Z', '2026-11-20T02:30:00.000Z'], // Nov 18 moved to Thu Nov 19, 8 PM
  ])
  const allDay = vcal(['UID:ad', 'DTSTART;VALUE=DATE:20261107', 'RRULE:FREQ=WEEKLY;COUNT=3', 'EXDATE;VALUE=DATE:20261114'])
  assert.deepEqual(starts(gs, allDay, '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z'), ['2026-11-07T05:00:00.000Z', '2026-11-21T05:00:00.000Z'])
})

test('ics: only the requested range is expanded, even for old endless series; long events overlapping the start count', () => {
  const { gs } = load()
  const text = vcal(
    ['UID:old', 'DTSTART;TZID=America/Toronto:20100101T090000', 'DURATION:PT30M', 'RRULE:FREQ=DAILY'],
    ['UID:done', 'DTSTART;TZID=America/Toronto:20100101T120000', 'DURATION:PT30M', 'RRULE:FREQ=DAILY;COUNT=5'],
    ['UID:overnight', 'DTSTART:20261101T200000Z', 'DTEND:20261102T060000Z'],
  )
  const t0 = performance.now()
  assert.deepEqual(blocks(gs, text, '2026-11-02T00:00:00Z', '2026-11-05T05:00:00Z'), [
    ['2026-11-01T20:00:00.000Z', '2026-11-02T06:00:00.000Z'],
    ['2026-11-02T14:00:00.000Z', '2026-11-02T14:30:00.000Z'],
    ['2026-11-03T14:00:00.000Z', '2026-11-03T14:30:00.000Z'],
    ['2026-11-04T14:00:00.000Z', '2026-11-04T14:30:00.000Z'],
  ])
  assert.ok(performance.now() - t0 < 500, 'jumps straight to the range')
})

const ICLOUD_A = 'https://p01-caldav.icloud.com/published/2/AAAA'
const ICLOUD_B = 'https://p02-caldav.icloud.com/published/2/BBBB'
const dentist = vcal(['UID:x', 'SUMMARY:Secret dentist', 'DESCRIPTION:private notes', 'DTSTART;TZID=America/Toronto:20261110T100000', 'DTEND;TZID=America/Toronto:20261110T110000'])
const availability = (gs, from = '2026-11-02T00:00:00Z', to = '2026-12-01T00:00:00Z') => gs.doGet({ parameter: { action: 'availability', from, to } }).body

test('before the first sync, availability reads iCloud live; webcal:// links work; failures are counted, not fatal', () => {
  const { gs, store } = load({
    freeBusy: { primary: { busy: [{ start: '2026-11-10T16:00:00Z', end: '2026-11-10T17:00:00Z' }] } },
    props: { ICLOUD_ICS_URLS: `webcal://p01-caldav.icloud.com/published/2/AAAA,\n  ${ICLOUD_B}\nnot-a-link` },
    ics: { [ICLOUD_A]: dentist, [ICLOUD_B]: { code: 404 } },
  })
  const res = availability(gs)
  assert.deepEqual(res.busy, [{ start: '2026-11-10T15:00:00.000Z', end: '2026-11-10T17:00:00.000Z' }], 'iCloud 10–11 merged with Google 11–12')
  assert.equal(res.icloudErrors, 2, 'one 404 and one entry that is not a link')
  assert.equal(res.icloudSyncedAt, null)
  assert.deepEqual(store.icsFetches, [ICLOUD_A, ICLOUD_B])
  assert.doesNotMatch(JSON.stringify(res), /dentist|private/)
})

test('iCloud fetch throwing or returning junk is skipped', () => {
  const { gs } = load({
    props: { ICLOUD_ICS_URLS: `${ICLOUD_A} ${ICLOUD_B}` },
    ics: { [ICLOUD_A]: new Error('DNS error'), [ICLOUD_B]: '<html>Sign in</html>' },
  })
  const res = availability(gs)
  assert.equal(res.success, true)
  assert.deepEqual(res.busy, [])
  assert.equal(res.icloudErrors, 2)
})

test('no ICLOUD_ICS_URLS → no iCloud fetches, sync stores nothing', () => {
  const { gs, store } = load()
  availability(gs)
  const r = gs.syncIcloud()
  assert.equal(r.read, 0)
  assert.deepEqual(store.icsFetches, [])
  assert.equal(availability(gs, '2026-11-03T00:00:00Z').icloudSyncedAt, null)
})

test('busy blocks are stored compactly and rounded outwards to whole minutes', () => {
  const { gs } = load()
  const busy = [{ start: Date.parse('2026-11-10T15:00:30Z'), end: Date.parse('2026-11-10T16:00:10Z') }, { start: Date.parse('2027-12-01T00:00:00Z'), end: Date.parse('2027-12-01T09:00:00Z') }]
  const text = gs.encodeBusy_(busy)
  assert.ok(text.length < 25, text)
  assert.deepEqual(JSON.parse(JSON.stringify(gs.decodeBusy_(text))).map((b) => [iso(b.start), iso(b.end)]), [
    ['2026-11-10T15:00:00.000Z', '2026-11-10T16:01:00.000Z'],
    ['2027-12-01T00:00:00.000Z', '2027-12-01T09:00:00.000Z'],
  ])
  assert.deepEqual([...gs.decodeBusy_('')], [])
})

test('syncIcloud stores a snapshot; availability then reads it without fetching and reports icloudSyncedAt', () => {
  const { gs, store, now } = load({ props: { ICLOUD_ICS_URLS: ICLOUD_A }, ics: { [ICLOUD_A]: dentist } })
  const r = gs.syncIcloud()
  assert.equal(r.read, 1)
  assert.equal(r.events, 1)
  assert.equal(r.blocks, 1)
  assert.equal(r.until, now + 400 * DAY)
  assert.doesNotMatch(JSON.stringify(store.props), /dentist|private/, 'no titles stored')
  store.icsFetches.length = 0
  const res = availability(gs)
  assert.deepEqual(res.busy, [{ start: '2026-11-10T15:00:00.000Z', end: '2026-11-10T16:00:00.000Z' }])
  assert.equal(res.icloudSyncedAt, iso(now))
  assert.equal(res.icloudErrors, 0)
  assert.deepEqual(store.icsFetches, [], 'served from the snapshot')

  availability(gs, iso(now + 390 * DAY), iso(now + 420 * DAY))
  assert.deepEqual(store.icsFetches, [ICLOUD_A], 'months past the 400-day snapshot are read live')
})

test('re-sync swaps chunks cleanly; a calendar that fails keeps its previous busy times', () => {
  const ics = { [ICLOUD_A]: dentist, [ICLOUD_B]: vcal(['UID:y', 'DTSTART:20261112T150000Z', 'DURATION:PT1H']) }
  const { gs, store } = load({ props: { ICLOUD_ICS_URLS: `${ICLOUD_A}\n${ICLOUD_B}` }, ics })
  gs.syncIcloud()
  ics[ICLOUD_B] = { code: 503 }
  const r = gs.syncIcloud()
  assert.equal(r.errors, 1)
  const res = availability(gs)
  assert.equal(res.busy.length, 2, 'the Nov 12 block from the unreadable calendar is kept')
  assert.equal(res.icloudErrors, 1)
  const chunkGens = new Set(Object.keys(store.props).filter((k) => /^icloud_[a-z0-9]+_\d+$/.test(k)).map((k) => k.split('_')[1]))
  assert.equal(chunkGens.size, 1, 'old chunks are deleted')
})

test('POST reads iCloud live, so an event added after the morning sync still blocks the time', () => {
  const ics = { [ICLOUD_A]: vcal() }
  const { gs, store } = load({ props: { ICLOUD_ICS_URLS: ICLOUD_A }, ics })
  gs.syncIcloud()
  assert.deepEqual(availability(gs).busy, [])
  ics[ICLOUD_A] = vcal(['UID:new', 'DTSTART;TZID=America/Toronto:20261107T103000', 'DURATION:PT1H'])
  store.icsFetches.length = 0
  const res = post(gs, { ...base, slots: [slot(SAT_10, SAT_11), slot(SUN_10, SUN_11)] })
  assert.equal(res.code, 'conflict')
  assert.deepEqual(res.conflicts, [SAT_10])
  assert.equal(store.icsFetches.length, 1, 'one fetch per calendar for all options')
  assert.equal(store.events.length, 0)
})

test('POST falls back to the snapshot when the live iCloud fetch fails', () => {
  const ics = { [ICLOUD_A]: vcal(['UID:s', 'DTSTART;TZID=America/Toronto:20261107T103000', 'DURATION:PT1H']) }
  const { gs, store } = load({ props: { ICLOUD_ICS_URLS: ICLOUD_A }, ics })
  gs.syncIcloud()
  ics[ICLOUD_A] = new Error('timeout')
  assert.equal(post(gs, { ...base, slots: [slot(SAT_10, SAT_11)] }).code, 'conflict')
  assert.equal(post(gs, { ...base, slots: [slot(SUN_10, SUN_11)] }).success, true)
  assert.equal(store.events.length, 1)
})

test('installDailySync is idempotent: one syncIcloud trigger, daily ~5 AM Toronto', () => {
  const { gs, store } = load()
  gs.installDailySync()
  gs.installDailySync()
  assert.equal(store.triggers.length, 1)
  assert.deepEqual({ ...store.triggers[0], getHandlerFunction: undefined }, { fn: 'syncIcloud', everyDays: 1, atHour: 5, tz: 'America/Toronto', getHandlerFunction: undefined })
})

test('setIcloudUrls: committed list is empty; saving links installs the sync and logs counts only', () => {
  assert.match(source, /const ICLOUD_URLS_TO_SAVE = \[\s*(\/\*[^*]*\*\/)?\s*\];/, 'ICLOUD_URLS_TO_SAVE must be committed empty')
  const { gs, store } = load({ ics: { [ICLOUD_A]: dentist, [ICLOUD_B]: { code: 404 } } })
  assert.equal(gs.setIcloudUrls(), null, 'nothing to save')
  assert.match(store.logs[0], /ICLOUD_URLS_TO_SAVE is empty/)
  assert.equal(store.props.ICLOUD_ICS_URLS, undefined)

  const r = gs.setIcloudUrls(['webcal://p01-caldav.icloud.com/published/2/AAAA', ` ${ICLOUD_B} `])
  assert.equal(store.props.ICLOUD_ICS_URLS, `webcal://p01-caldav.icloud.com/published/2/AAAA\n${ICLOUD_B}`)
  assert.equal(store.triggers.length, 1)
  assert.equal(r.read, 1)
  const log = store.logs[1]
  assert.match(log, /Calendars read: 1 of 2 · events: 1 · busy blocks: 1 · errors: 1/)
  assert.match(log, /Calendar 2: not read \(HTTP 404\)/)
  assert.match(log, /empty ICLOUD_URLS_TO_SAVE again/)
  assert.doesNotMatch(log, /dentist|private|icloud\.com|AAAA/, 'no titles or links in the log')
})

/* A synthetic feed shaped like Yiyi's real iCloud calendars (no real content): Apple-style properties and
   alarms, folded long lines, lots of RRULEs, TZIDs without any VTIMEZONE block. */
function rng(seed) {
  let x = seed
  return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648)
}
const fold = (line) => {
  const out = []
  for (let i = 0; i < line.length; i += i ? 74 : 75) out.push((i ? ' ' : '') + line.slice(i, i ? i + 74 : 75))
  return out
}
function syntheticFeed(seed, count, zones) {
  const r = rng(seed)
  const stamp = (t) => iso(t).replace(/[-:]|\.000/g, '')
  const local = (t) => stamp(t).replace('Z', '')
  const days = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
  const events = []
  for (let i = 0; i < count; i++) {
    const tz = zones[i % zones.length]
    const start = Date.parse('2024-01-01T00:00:00Z') + Math.floor(r() * 1100) * DAY + (6 + Math.floor(r() * 14)) * HOUR + (r() < 0.5 ? 30 * 60e3 : 0)
    const lines = [
      `UID:${(seed * 100000 + i).toString(16).toUpperCase()}-SYNTH-${i}@icloud.com`,
      'DTSTAMP:20261101T120000Z', 'CREATED:20240101T120000Z', 'LAST-MODIFIED:20261001T120000Z', `SEQUENCE:${i % 4}`,
      `SUMMARY:Synthetic event ${i}`,
      ...fold(`DESCRIPTION:${'Placeholder notes for a synthetic test event. '.repeat(1 + (i % 3))}`),
      `LOCATION:Place ${i}`, 'X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC',
    ]
    const kind = r()
    if (kind < 0.12) {
      lines.push(`DTSTART;VALUE=DATE:${local(start).slice(0, 8)}`, `DTEND;VALUE=DATE:${local(start + DAY).slice(0, 8)}`, 'TRANSP:TRANSPARENT')
    } else {
      lines.push(`DTSTART;TZID=${tz}:${local(start)}`, `DTEND;TZID=${tz}:${local(start + (1 + Math.floor(r() * 3)) * HOUR)}`)
    }
    if (kind > 0.45) {
      const f = r()
      lines.push(
        f < 0.45 ? `RRULE:FREQ=WEEKLY;BYDAY=${days[i % 7]}${i % 3 ? '' : `,${days[(i + 2) % 7]}`}${i % 5 ? '' : ';INTERVAL=2'}`
        : f < 0.6 ? `RRULE:FREQ=DAILY;COUNT=${5 + (i % 40)}`
        : f < 0.8 ? `RRULE:FREQ=MONTHLY;BYDAY=${i % 2 ? '2MO' : '-1FR'}`
        : f < 0.9 ? 'RRULE:FREQ=YEARLY'
        : `RRULE:FREQ=WEEKLY;UNTIL=${stamp(start + 200 * DAY)}`,
      )
      if (i % 6 === 0) lines.push(`EXDATE;TZID=${tz}:${local(start + 7 * DAY)}`)
    }
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'TRIGGER:-PT15M', `UID:alarm-${i}`, 'END:VALARM')
    events.push(lines)
  }
  return vcal(...events)
}
const ZONES = ['America/Toronto', 'America/Toronto', 'America/Los_Angeles', 'America/Vancouver']
const REAL_SHAPE = [325, 300, 170, 120, 60, 25, 0].map((n, i) => syntheticFeed(i + 1, n, ZONES))
const REAL_URLS = REAL_SHAPE.map((_, i) => `https://p${10 + i}-caldav.icloud.com/published/2/SYNTH${i}`)

test('synthetic fixture has the shape of the real feeds', () => {
  const counts = REAL_SHAPE.map((t) => (t.match(/^BEGIN:VEVENT/gm) || []).length)
  assert.deepEqual(counts, [325, 300, 170, 120, 60, 25, 0])
  assert.ok(REAL_SHAPE[0].length > 150e3 && REAL_SHAPE[0].length < 220e3, `largest feed ${(REAL_SHAPE[0].length / 1e3).toFixed(0)} KB`)
  assert.ok(REAL_SHAPE.every((t) => !t.includes('VTIMEZONE')))
  assert.ok(REAL_SHAPE[0].includes('TZID=America/Vancouver') && REAL_SHAPE[0].includes('TZID=America/Los_Angeles'))
  assert.ok((REAL_SHAPE[0].match(/^RRULE/gm) || []).length > 150)
})

test('daily sync of 7 real-shaped feeds (~1000 events, RRULEs, 400 days) is fast and small', () => {
  const { gs, store } = load({ props: { ICLOUD_ICS_URLS: REAL_URLS.join(',\n') }, ics: Object.fromEntries(REAL_URLS.map((u, i) => [u, REAL_SHAPE[i]])) })
  assert.deepEqual([...gs.icloudUrls_().urls], REAL_URLS)
  for (const z of ZONES) assert.equal(gs.icsZone_(z), z, 'TZIDs are IANA names and resolve directly')
  const t0 = performance.now()
  const r = gs.syncIcloud()
  const ms = performance.now() - t0
  assert.equal(r.read, 7, 'the empty calendar counts as read')
  assert.equal(r.errors, 0)
  assert.equal(r.events, 1000)
  assert.ok(r.blocks > 300, `${r.blocks} busy blocks`)
  const chunks = Object.entries(store.props).filter(([k]) => /^icloud_[a-z0-9]+_\d+$/.test(k))
  const size = chunks.reduce((n, [, v]) => n + v.length, 0)
  assert.ok(chunks.every(([, v]) => v.length <= 9000), 'every chunk fits the 9 KB property limit')
  assert.ok(size < 100e3, `snapshot ${(size / 1e3).toFixed(1)} KB of the 500 KB budget`)
  assert.doesNotMatch(JSON.stringify(store.props), /Synthetic|Placeholder|Place \d/)
  // Apps Script is slower than Node; formatDate calls are the expensive part there.
  assert.ok(ms < 3000, `sync took ${ms.toFixed(0)} ms`)
  assert.ok(store.formatCalls < 15000, `${store.formatCalls} Utilities.formatDate calls`)
  console.log(`  real-shaped sync: ${r.events} events → ${r.blocks} blocks, ${(size / 1e3).toFixed(1)} KB in ${chunks.length} properties, ${ms.toFixed(0)} ms, ${store.formatCalls} formatDate calls`)

  const busy = availability(gs).busy
  assert.ok(busy.length > 0)
  assert.ok(busy.every((b) => Object.keys(b).join() === 'start,end'))
})
