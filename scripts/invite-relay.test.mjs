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
function load({ freeBusy = { primary: { busy: [] }, 'ee.official67@gmail.com': { busy: [] } }, now = NOW } = {}) {
  const store = { mail: [], events: [], props: {}, cache: {}, fetches: [] }
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

test('work hours: Mon–Fri 6:00–19:00 Toronto, half-open, DST-aware, weekends free', () => {
  const { gs } = load()
  const w = (a, b) => gs.overlapsWorkHours_(Date.parse(a), Date.parse(b))
  assert.equal(w('2026-11-03T10:00:00Z', '2026-11-03T11:00:00Z'), false, 'Tue 5–6 AM EST ends right at 6')
  assert.equal(w('2026-11-03T10:30:00Z', '2026-11-03T11:30:00Z'), true, 'Tue 5:30–6:30 AM')
  assert.equal(w('2026-11-03T13:00:00Z', '2026-11-03T14:00:00Z'), true, 'Tue 8–9 AM')
  assert.equal(w('2026-11-03T23:30:00Z', '2026-11-04T00:30:00Z'), true, 'Tue 6:30–7:30 PM')
  assert.equal(w('2026-11-04T00:00:00Z', '2026-11-04T03:00:00Z'), false, 'Tue 7–10 PM')
  assert.equal(w('2026-11-06T23:00:00Z', '2026-11-07T01:00:00Z'), true, 'Fri 6–8 PM')
  assert.equal(w('2026-11-07T11:00:00Z', '2026-11-07T20:00:00Z'), false, 'Sat 6 AM–3 PM (9h hike)')
  assert.equal(w('2026-11-08T11:00:00Z', '2026-11-08T20:00:00Z'), false, 'Sun 6 AM–3 PM')
  assert.equal(w('2026-11-03T11:00:00Z', '2026-11-03T20:00:00Z'), true, 'Tue 9h hike')
  assert.equal(w('2026-11-09T01:00:00Z', '2026-11-09T11:00:00Z'), false, 'Sun 8 PM → Mon 6 AM')
  assert.equal(w('2026-11-09T01:00:00Z', '2026-11-09T11:30:00Z'), true, 'Sun 8 PM → Mon 6:30 AM')
  assert.equal(w('2027-07-13T23:00:00Z', '2027-07-14T00:00:00Z'), false, 'summer Tue 7–8 PM EDT')
  assert.equal(w('2027-07-13T22:30:00Z', '2027-07-13T23:00:00Z'), true, 'summer Tue 6:30–7 PM EDT')
  assert.equal(w('2027-07-13T10:00:00Z', '2027-07-13T10:30:00Z'), true, 'summer Tue 6 AM EDT')
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
  assert.deepEqual(Object.keys(res).sort(), ['busy', 'calendarsMissing', 'success', 'timeZone'])
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

test('POST rejects work hours server-side', () => {
  const { gs, store } = load()
  const res = post(gs, { ...base, slots: [slot('2026-11-05T15:00:00Z', '2026-11-05T16:00:00Z')] })
  assert.equal(res.success, false)
  assert.equal(res.code, 'work')
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
  post(gs, { ...base, name: 'Lee', replyTo: 'lee@example.com', activity: 'Hike', slots: [slot('2026-11-07T11:00:00Z', '2026-11-07T20:00:00Z'), slot('2026-11-08T11:00:00Z', '2026-11-08T20:00:00Z')] })
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
