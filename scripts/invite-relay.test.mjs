import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

const source = fs.readFileSync(path.join(import.meta.dirname, 'invite-relay.gs'), 'utf8')
const HOUR = 3600e3
const DAY = 24 * HOUR

/** Loads invite-relay.gs into a sandbox with fake Apps Script services. */
function load({ freeBusy, now = Date.parse('2026-11-02T12:00:00Z') } = {}) {
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
  const fmt = (date, tz, pattern) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', hourCycle: 'h12', weekday: 'short', timeZoneName: 'short',
    }).formatToParts(date).map((x) => [x.type, x.value]))
    if (pattern === 'yyyyMMdd') return `${p.year}${p.month}${p.day}`
    return `${p.weekday} ${p.month}/${p.day} ${p.hour}:${p.minute} ${p.dayPeriod} ${p.timeZoneName}`
  }
  const sandbox = {
    Date: class extends Date {
      constructor(...a) { super(...(a.length ? a : [now])) }
      static now() { return now }
    },
    JSON, Math, Object, String, Number, isFinite, encodeURIComponent,
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
    Utilities: { getUuid: () => crypto.randomUUID(), formatDate: fmt },
    UrlFetchApp: {
      fetch: (url, opts) => {
        store.fetches.push({ url, body: JSON.parse(opts.payload) })
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ calendars: freeBusy }) }
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

test('clampWindow_ caps to now..now+60d', () => {
  const { gs, now } = load()
  const w = gs.clampWindow_(iso(now - DAY), iso(now + 400 * DAY), now)
  assert.equal(w.from, now)
  assert.equal(w.to, now + 60 * DAY)
  assert.equal(gs.clampWindow_(iso(now + 5 * DAY), iso(now + 2 * DAY), now), null)
})

test('validateRequest_ rules', () => {
  const { gs, now } = load()
  const ok = { replyTo: 'a@b.co', start: iso(now + DAY), end: iso(now + DAY + HOUR) }
  assert.equal(gs.validateRequest_(ok, now).timed, true)
  assert.equal(gs.validateRequest_({ subject: 'hi' }, now).timed, false)
  assert.equal(gs.validateRequest_({ ...ok, start: iso(now + 10 * 60e3) }, now).ok, false, 'needs lead time')
  assert.equal(gs.validateRequest_({ ...ok, end: iso(now + DAY + 13 * HOUR) }, now).ok, false, 'max 12h')
  assert.equal(gs.validateRequest_({ ...ok, end: ok.start }, now).ok, false, 'end after start')
  assert.equal(gs.validateRequest_({ ...ok, start: iso(now + 70 * DAY), end: iso(now + 70 * DAY + HOUR) }, now).ok, false, 'window')
  assert.equal(gs.validateRequest_({ ...ok, replyTo: 'nope' }, now).ok, false, 'email required for timed')
  assert.equal(gs.validateRequest_({ ...ok, start: 'tomorrow' }, now).ok, false)
  assert.equal(gs.validateRequest_({ ...ok, name: 'x'.repeat(500) }, now).name.length, 100)
  assert.equal(gs.validateRequest_({ ...ok, timeZone: '<script>' }, now).timeZone, '')
  assert.equal(gs.validateRequest_({ ...ok, timeZone: 'America/Argentina/Buenos_Aires' }, now).timeZone, 'America/Argentina/Buenos_Aires')
})

test('availability returns merged busy blocks only, flags a calendar that is not shared', () => {
  const { gs, store } = load({
    freeBusy: {
      primary: { busy: [{ start: '2026-11-05T14:00:00Z', end: '2026-11-05T15:00:00Z' }, { start: '2026-11-05T14:30:00Z', end: '2026-11-05T16:00:00Z' }] },
      'ee.official67@gmail.com': { errors: [{ domain: 'global', reason: 'notFound' }], busy: [] },
    },
  })
  const res = gs.doGet({ parameter: { action: 'availability', from: '2026-11-02T00:00:00Z', to: '2026-12-31T00:00:00Z' } }).body
  assert.deepEqual(res.busy, [{ start: '2026-11-05T14:00:00.000Z', end: '2026-11-05T16:00:00.000Z' }])
  assert.deepEqual(res.calendarsMissing, ['ee.official67@gmail.com'])
  assert.deepEqual(Object.keys(res).sort(), ['busy', 'calendarsMissing', 'success', 'timeZone'])
  assert.deepEqual(store.fetches[0].body.items.map((i) => i.id), ['primary', 'ee.official67@gmail.com'])
})

test('both calendars contribute busy time', () => {
  const { gs } = load({
    freeBusy: {
      primary: { busy: [{ start: '2026-11-05T14:00:00Z', end: '2026-11-05T15:00:00Z' }] },
      'ee.official67@gmail.com': { busy: [{ start: '2026-11-06T14:00:00Z', end: '2026-11-06T15:00:00Z' }] },
    },
  })
  const res = gs.doGet({ parameter: { action: 'availability' } }).body
  assert.equal(res.busy.length, 2)
  assert.deepEqual(res.calendarsMissing, [])
})

test('timed invite: conflict is rejected, free slot creates a hold + email with accept/decline links', () => {
  const { gs, store } = load({
    freeBusy: { primary: { busy: [{ start: '2026-11-05T14:00:00Z', end: '2026-11-05T15:00:00Z' }] }, 'ee.official67@gmail.com': { busy: [] } },
  })
  const base = { subject: "Let's do this: Coffee", message: 'hi!', name: 'Sam', replyTo: 'sam@example.com', source: 'Tiny AI', activity: 'Coffee chat', timeZone: 'Europe/Paris' }

  const clash = post(gs, { ...base, start: '2026-11-05T14:30:00Z', end: '2026-11-05T15:30:00Z' })
  assert.equal(clash.success, false)
  assert.equal(clash.code, 'conflict')
  assert.equal(store.events.length, 0)

  const ok = post(gs, { ...base, start: '2026-11-05T15:00:00Z', end: '2026-11-05T16:00:00Z' })
  assert.equal(ok.success, true)
  assert.equal(store.events.length, 1)
  const hold = store.events[0]
  assert.equal(hold.title, '♡ Request: Coffee chat with Sam')
  assert.equal(hold.color, '4')
  assert.equal(hold.opts.guests, undefined, 'visitor is not invited until Yiyi accepts')
  assert.equal(store.mail.length, 1)
  const mail = store.mail[0]
  assert.equal(mail.to, 'yiyitan076@gmail.com')
  assert.equal(mail.replyTo, 'sam@example.com')
  assert.match(mail.body, /When \(Toronto\): .*EST/)
  assert.match(mail.body, /Their time \(Europe\/Paris\)/)
  const accept = mail.body.match(/Accept[^:]*: (\S+)/)[1]
  const decline = mail.body.match(/Decline[^:]*: (\S+)/)[1]
  assert.match(accept, /\?action=accept&id=ev1%40google\.com&token=[a-f0-9]{64}$/)

  const params = (u) => Object.fromEntries(new URL(u).searchParams)
  const page = gs.doGet({ parameter: params(accept) })
  assert.match(page.html, /Coffee chat/)
  assert.equal(store.events[0].deleted, false, 'opening the link alone changes nothing')

  const bad = gs.respondToRequest('accept', 'ev1@google.com', 'f'.repeat(64))
  assert.equal(bad.ok, false)

  const p = params(accept)
  const res = gs.respondToRequest('accept', p.id, p.token)
  assert.equal(res.ok, true)
  assert.equal(store.events[0].deleted, true)
  const confirmed = store.events[1]
  assert.equal(confirmed.title, '♡ Coffee chat with Sam')
  assert.equal(confirmed.opts.guests, 'sam@example.com')
  assert.equal(confirmed.opts.sendInvites, true)
  assert.equal(gs.respondToRequest('decline', p.id, p.token).ok, false, 'token is single-use')
  void decline
})

test('decline deletes the hold and emails the visitor from Yiyi', () => {
  const { gs, store } = load({ freeBusy: { primary: { busy: [] }, 'ee.official67@gmail.com': { busy: [] } } })
  post(gs, { subject: 's', message: 'm', name: 'Lee', replyTo: 'lee@example.com', source: 'Connect', activity: 'Hike', start: '2026-11-07T13:00:00Z', end: '2026-11-07T22:00:00Z' })
  const decline = store.mail[0].body.match(/Decline[^:]*: (\S+)/)[1]
  const p = Object.fromEntries(new URL(decline).searchParams)
  assert.equal(gs.respondToRequest('decline', p.id, p.token).ok, true)
  assert.equal(store.events[0].deleted, true)
  const note = store.mail[1]
  assert.equal(note.to, 'lee@example.com')
  assert.equal(note.replyTo, 'yiyitan076@gmail.com')
  assert.match(note.body, /Hi Lee/)
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
