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
function load({ freeBusy = { primary: { busy: [] }, 'ee.official67@gmail.com': { busy: [] } }, now = NOW, props = {}, ics = {} } = {}) {
  const store = { mail: [], events: [], props: { ...props }, cache: {}, fetches: [], icsFetches: [] }
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
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    MailApp: { sendEmail: (m) => store.mail.push(m) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'yiyitan076@gmail.com' }) },
    ScriptApp: { getOAuthToken: () => 'tok', getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/X/exec' }) },
    Utilities: { getUuid: () => crypto.randomUUID(), formatDate },
    UrlFetchApp: {
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

test('BOOKABLE_HOURS matches src/lib/calendar.ts', () => {
  const { gs } = load()
  const ts = fs.readFileSync(path.join(import.meta.dirname, '../src/lib/calendar.ts'), 'utf8')
  const block = ts.slice(ts.indexOf('BOOKABLE_HOURS: Window[] = ['), ts.indexOf(']', ts.indexOf('BOOKABLE_HOURS: Window[] = [') + 30) + 1)
  const fromTs = vm.runInNewContext(block.replace('BOOKABLE_HOURS: Window[] =', '').trim())
  assert.deepEqual(JSON.parse(JSON.stringify(fromTs)), JSON.parse(JSON.stringify(gs.CONFIG.BOOKABLE_HOURS)))
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

test('availability returns merged busy blocks only, flags a calendar that is not shared', () => {
  const { gs, store } = load({
    freeBusy: {
      primary: { busy: [{ start: '2026-11-05T14:00:00Z', end: '2026-11-05T15:00:00Z' }, { start: '2026-11-05T14:30:00Z', end: '2026-11-05T16:00:00Z' }] },
      'ee.official67@gmail.com': { errors: [{ domain: 'global', reason: 'notFound' }], busy: [] },
    },
  })
  const res = gs.doGet({ parameter: { action: 'availability', from: '2026-11-02T00:00:00Z', to: '2026-12-01T00:00:00Z' } }).body
  assert.deepEqual(res.busy, [{ start: '2026-11-05T14:00:00.000Z', end: '2026-11-05T16:00:00.000Z' }])
  assert.deepEqual(res.calendarsMissing, ['ee.official67@gmail.com'])
  assert.deepEqual(Object.keys(res).sort(), ['busy', 'calendarsMissing', 'icloudErrors', 'success', 'timeZone'])
  assert.equal(res.icloudErrors, 0)
  assert.deepEqual(store.fetches[0].body.items.map((i) => i.id), ['primary', 'ee.official67@gmail.com'])
})

test('availability for a month far ahead queries exactly that window', () => {
  const { gs, store } = load({
    freeBusy: {
      primary: { busy: [] },
      'ee.official67@gmail.com': { busy: [{ start: '2027-05-15T14:00:00Z', end: '2027-05-15T16:00:00Z' }] },
    },
  })
  const res = gs.doGet({ parameter: { action: 'availability', from: '2027-05-01T04:00:00Z', to: '2027-06-01T04:00:00Z' } }).body
  assert.equal(res.busy.length, 1, 'second calendar contributes')
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
    freeBusy: { primary: { busy: [{ start: '2026-11-08T15:30:00Z', end: '2026-11-08T17:00:00Z' }] }, 'ee.official67@gmail.com': { busy: [] } },
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

test('availability merges iCloud busy blocks; webcal:// links work; failures are counted, not fatal', () => {
  const { gs, store } = load({
    freeBusy: { primary: { busy: [{ start: '2026-11-10T16:00:00Z', end: '2026-11-10T17:00:00Z' }] }, 'ee.official67@gmail.com': { busy: [] } },
    props: { ICLOUD_ICS_URLS: `webcal://p01-caldav.icloud.com/published/2/AAAA,\n  ${ICLOUD_B}\nnot-a-link` },
    ics: { [ICLOUD_A]: dentist, [ICLOUD_B]: { code: 404 } },
  })
  const res = gs.doGet({ parameter: { action: 'availability', from: '2026-11-02T00:00:00Z', to: '2026-12-01T00:00:00Z' } }).body
  assert.deepEqual(res.busy, [{ start: '2026-11-10T15:00:00.000Z', end: '2026-11-10T17:00:00.000Z' }], 'iCloud 10–11 merged with Google 11–12')
  assert.equal(res.icloudErrors, 2, 'one 404 and one entry that is not a link')
  assert.deepEqual(store.icsFetches, [ICLOUD_A, ICLOUD_B])
  assert.doesNotMatch(JSON.stringify(res), /dentist|private/)
  assert.doesNotMatch(JSON.stringify(store.cache), /dentist|private/, 'titles are not even cached')

  const again = gs.doGet({ parameter: { action: 'availability', from: '2026-11-03T00:00:00Z', to: '2026-12-01T00:00:00Z' } }).body
  assert.equal(again.busy.length, 1)
  assert.deepEqual(store.icsFetches, [ICLOUD_A, ICLOUD_B, ICLOUD_B], 'the working feed comes from the 10-minute cache')
})

test('iCloud fetch throwing or returning junk is skipped', () => {
  const { gs } = load({
    props: { ICLOUD_ICS_URLS: `${ICLOUD_A} ${ICLOUD_B}` },
    ics: { [ICLOUD_A]: new Error('DNS error'), [ICLOUD_B]: '<html>Sign in</html>' },
  })
  const res = gs.doGet({ parameter: { action: 'availability', from: '2026-11-02T00:00:00Z', to: '2026-12-01T00:00:00Z' } }).body
  assert.equal(res.success, true)
  assert.deepEqual(res.busy, [])
  assert.equal(res.icloudErrors, 2)
})

test('no ICLOUD_ICS_URLS → no iCloud fetches', () => {
  const { gs, store } = load()
  gs.doGet({ parameter: { action: 'availability', from: '2026-11-02T00:00:00Z', to: '2026-12-01T00:00:00Z' } })
  assert.deepEqual(store.icsFetches, [])
})

test('POST conflict check includes iCloud events', () => {
  const sat = vcal(['UID:s', 'DTSTART;TZID=America/Toronto:20261107T103000', 'DURATION:PT1H'])
  const { gs, store } = load({ props: { ICLOUD_ICS_URLS: ICLOUD_A }, ics: { [ICLOUD_A]: sat } })
  const res = post(gs, { ...base, slots: [slot(SAT_10, SAT_11), slot(SUN_10, SUN_11)] })
  assert.equal(res.code, 'conflict')
  assert.deepEqual(res.conflicts, [SAT_10])
  assert.equal(store.events.length, 0)
  assert.equal(post(gs, { ...base, slots: [slot(SUN_10, SUN_11)] }).success, true)
})

test('big iCloud feeds are cached in chunks and read back intact', () => {
  const many = vcal(...Array.from({ length: 1500 }, (_, i) => [
    `UID:event-${i}@icloud.com`, `SUMMARY:Thing ${i}`,
    `DTSTART:${iso(Date.parse('2026-11-02T13:00:00Z') + i * DAY).replace(/[-:]|\.000/g, '')}`, 'DURATION:PT1H',
  ]))
  const { gs, store } = load({ props: { ICLOUD_ICS_URLS: ICLOUD_A }, ics: { [ICLOUD_A]: many } })
  const first = gs.icloudBusy_(Date.parse('2026-11-02T00:00:00Z'), Date.parse('2026-12-01T00:00:00Z'))
  const chunkKeys = Object.keys(store.cache).filter((k) => /^ics:.+:\d+$/.test(k))
  assert.ok(chunkKeys.length > 1, `split into ${chunkKeys.length} chunks`)
  const second = gs.icloudBusy_(Date.parse('2026-11-02T00:00:00Z'), Date.parse('2026-12-01T00:00:00Z'))
  assert.equal(store.icsFetches.length, 1)
  assert.equal(first.busy.length, 29)
  assert.deepEqual(JSON.parse(JSON.stringify(second)), JSON.parse(JSON.stringify(first)))
})
