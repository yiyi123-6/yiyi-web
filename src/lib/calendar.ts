/** Time-zone and slot math for the booking picker. Pure: no imports, so it's easy to test. */

export const YIYI_TZ = 'America/Toronto'
export const DAY_START_MIN = 6 * 60
export const DAY_END_MIN = 22 * 60
export const MORNING_ONLY_FROM_MIN = 5 * 60
export const LATEST_MORNING_START_MIN = 10 * 60
export const STEP_MIN = 30
export const LEAD_MIN = 2 * 60
export const MAX_DURATION_MIN = 12 * 60
/** How far ahead visitors can propose plans (the relay enforces the same cap). */
export const MAX_AHEAD_DAYS = 730
export const MAX_OPTIONS = 5
/**
 * Never bookable, in Yiyi's time. Days: 0 = Sunday … 6 = Saturday. Minutes after midnight.
 * Keep in sync with CONFIG.WORK_HOURS in scripts/invite-relay.gs.
 */
export const WORK_HOURS = { days: [1, 2, 3, 4, 5], startMin: 9 * 60, endMin: 19 * 60 }
export const WORK_HOURS_LABEL = 'Mon–Fri 9 AM–7 PM'
export const DURATIONS_MIN = [30, 60, 90, 120, 180, 240, 300, 360, 480, 540, 600, 720]

export type Busy = { start: number; end: number }
export type Slot = { start: Date; end: Date }
export type Day = { key: string; y: number; m: number; d: number; weekday: number }

export const localTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

const partFormatters = new Map<string, Intl.DateTimeFormat>()
function zonedParts(date: Date, tz: string) {
  let f = partFormatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    })
    partFormatters.set(tz, f)
  }
  const o: Record<string, number> = {}
  for (const p of f.formatToParts(date)) if (p.type !== 'literal') o[p.type] = Number(p.value)
  return { y: o.year, m: o.month, d: o.day, h: o.hour % 24, mi: o.minute, s: o.second }
}

/** Milliseconds the zone is ahead of UTC at that instant (Toronto in winter: -5h). */
export function tzOffsetMs(date: Date, tz: string) {
  const p = zonedParts(date, tz)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(date.getTime() / 1000) * 1000
}

/** Minutes after midnight on the wall clock in `tz`. */
export function minutesOfDay(date: Date, tz = YIYI_TZ) {
  const p = zonedParts(date, tz)
  return p.h * 60 + p.mi
}

/** Wall-clock time in `tz` → the real instant. */
export function zonedToUtc(y: number, m: number, d: number, minutes: number, tz: string) {
  const guess = Date.UTC(y, m - 1, d, 0, minutes)
  const first = guess - tzOffsetMs(new Date(guess), tz)
  return new Date(guess - tzOffsetMs(new Date(first), tz))
}

export type Month = { y: number; m: number }

export const monthKey = ({ y, m }: Month) => `${y}-${String(m).padStart(2, '0')}`

export function monthOf(date: Date, tz = YIYI_TZ): Month {
  const p = zonedParts(date, tz)
  return { y: p.y, m: p.m }
}

export function addMonths({ y, m }: Month, n: number): Month {
  const i = y * 12 + (m - 1) + n
  return { y: Math.floor(i / 12), m: (i % 12) + 1 }
}

export const compareMonths = (a: Month, b: Month) => a.y * 12 + a.m - (b.y * 12 + b.m)

/** Every day of a month. */
export function monthDays({ y, m }: Month): Day[] {
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: count }, (_, i) => {
    const d = i + 1
    return { key: `${monthKey({ y, m })}-${String(d).padStart(2, '0')}`, y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }
  })
}

/** The instants a month starts and ends in `tz`. */
export function monthRange({ y, m }: Month, tz = YIYI_TZ) {
  const next = addMonths({ y, m }, 1)
  return { from: zonedToUtc(y, m, 1, 0, tz), to: zonedToUtc(next.y, next.m, 1, 0, tz) }
}

const DAY_MS = 86400e3

/** True if [start, end) touches the work-hours window on any day it spans. */
export function overlapsWorkHours(start: number, end: number, tz = YIYI_TZ) {
  const a = start + tzOffsetMs(new Date(start), tz)
  const b = end + tzOffsetMs(new Date(end), tz)
  for (let day = Math.floor(a / DAY_MS) * DAY_MS; day < b; day += DAY_MS) {
    if (!WORK_HOURS.days.includes(new Date(day).getUTCDay())) continue
    if (a < day + WORK_HOURS.endMin * 60e3 && b > day + WORK_HOURS.startMin * 60e3) return true
  }
  return false
}

/** Whether a plan this long fits before or after work on a weekday. */
export function fitsOnWeekdays(durationMin: number) {
  return DAY_START_MIN + durationMin <= WORK_HOURS.startMin || WORK_HOURS.endMin <= latestStartMin(durationMin)
}

/** Long plans (5h+) only start in the morning; everything ends by 22:00 Toronto time. */
export function latestStartMin(durationMin: number) {
  const cap = durationMin >= MORNING_ONLY_FROM_MIN ? LATEST_MORNING_START_MIN : DAY_END_MIN
  return Math.min(cap, DAY_END_MIN - durationMin)
}

export type SlotOption = Slot & { minutes: number; past: boolean; busy: boolean; work: boolean }

export function buildSlots(day: Day, durationMin: number, now: Date, busy: Busy[] = [], tz = YIYI_TZ): SlotOption[] {
  const out: SlotOption[] = []
  const lead = now.getTime() + LEAD_MIN * 60e3
  for (let min = DAY_START_MIN; min <= latestStartMin(durationMin); min += STEP_MIN) {
    const start = zonedToUtc(day.y, day.m, day.d, min, tz)
    const end = new Date(start.getTime() + durationMin * 60e3)
    out.push({
      start, end, minutes: min,
      past: start.getTime() < lead,
      busy: overlaps(start.getTime(), end.getTime(), busy),
      work: overlapsWorkHours(start.getTime(), end.getTime(), tz),
    })
  }
  return out
}

export const overlaps = (start: number, end: number, busy: Busy[]) => busy.some((b) => start < b.end && end > b.start)

export function sameClock(a: string, b: string, at: Date) {
  return tzOffsetMs(at, a) === tzOffsetMs(at, b)
}

export function durationLabel(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return `${m} min`
  return m ? `${h}h ${m}m` : `${h} hr${h > 1 ? 's' : ''}`
}

/** "9:00 AM" in a zone. */
export function timeLabel(date: Date, tz: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(date)
}

export function dayLabel(date: Date, tz: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }).format(date)
}

function zoneName(date: Date, tz: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? tz
}

/** "Sat, Nov 14 · 9:00 AM – 6:00 PM EST" (adds the year when it isn't this year, and the end day when it spills over midnight). */
export function describeSlot(slot: Slot, tz: string, now = new Date()) {
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }
  if (zonedParts(slot.start, tz).y !== zonedParts(now, tz).y) opts.year = 'numeric'
  const sameDay = dayLabel(slot.start, tz) === dayLabel(slot.end, tz)
  return `${dayLabel(slot.start, tz, opts)} · ${timeLabel(slot.start, tz)} – ${sameDay ? '' : `${dayLabel(slot.end, tz)}, `}${timeLabel(slot.end, tz)} ${zoneName(slot.end, tz)}`
}

/** "20261114T140000Z" */
export const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export type CalendarEvent = { title: string; details: string; slot: Slot; guest: string }

export function googleCalendarUrl({ title, details, slot, guest }: CalendarEvent) {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title, details, add: guest })
  return `https://calendar.google.com/calendar/render?${q.toString()}&dates=${utcStamp(slot.start)}/${utcStamp(slot.end)}`
}

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`)

/** A minimal .ics the visitor can open in any calendar app, with Yiyi as a guest. */
export function icsFor({ title, details, slot, guest }: CalendarEvent, now = new Date()) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    "PRODID:-//Yiyi's Universe//Invite//EN",
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${utcStamp(slot.start)}-${Math.random().toString(36).slice(2)}@yiyis-universe`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(slot.start)}`,
    `DTEND:${utcStamp(slot.end)}`,
    `SUMMARY:${icsText(title)}`,
    `DESCRIPTION:${icsText(details)}`,
    `ATTENDEE;CN=Yiyi;RSVP=TRUE:mailto:${guest}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

/** Lines for an email body: Yiyi's time, plus the visitor's when it differs. */
export function whenLines(slots: Slot[], visitorTz: string) {
  const one = (slot: Slot, indent: string) => {
    const lines = [`${describeSlot(slot, YIYI_TZ)} (Yiyi's time, Toronto)`]
    if (!sameClock(visitorTz, YIYI_TZ, slot.start)) lines.push(`${indent}= ${describeSlot(slot, visitorTz)} (my time, ${visitorTz})`)
    return lines.join('\n')
  }
  const duration = `⏱️ Duration: ${durationLabel(Math.round((slots[0].end.getTime() - slots[0].start.getTime()) / 60e3))}`
  if (slots.length === 1) return `📅 When: ${one(slots[0], '   ')}\n${duration}`
  return [`📅 Times that work for me (pick one):`, ...slots.map((s, i) => `${i + 1}. ${one(s, '   ')}`), duration].join('\n')
}
