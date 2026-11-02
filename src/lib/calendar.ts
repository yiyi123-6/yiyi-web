/** Time-zone and slot math for the booking picker. Pure: no imports, so it's easy to test. */

export const YIYI_TZ = 'America/Toronto'
export const MORNING_ONLY_FROM_MIN = 5 * 60
export const LATEST_MORNING_START_MIN = 10 * 60
export const STEP_MIN = 30
export const LEAD_MIN = 2 * 60
export const MAX_DURATION_MIN = 12 * 60
/** How far ahead visitors can propose plans (the relay enforces the same cap). */
export const MAX_AHEAD_DAYS = 730
export const MAX_OPTIONS = 5
export type Window = { startMin: number; endMin: number; work?: boolean }
/**
 * When plans can happen, in Yiyi's time, by weekday (0 = Sunday … 6 = Saturday), in minutes after midnight.
 * A plan has to start and end inside its day's window. `work` days are work time until the window opens.
 * Keep in sync with CONFIG.BOOKABLE_HOURS in scripts/invite-relay.gs.
 */
export const BOOKABLE_HOURS: Window[] = [
  { startMin: 9 * 60, endMin: 22 * 60 }, // Sun
  { startMin: 19 * 60, endMin: 22 * 60, work: true }, // Mon
  { startMin: 19 * 60, endMin: 22 * 60, work: true }, // Tue
  { startMin: 19 * 60, endMin: 22 * 60, work: true }, // Wed
  { startMin: 19 * 60, endMin: 22 * 60, work: true }, // Thu
  { startMin: 19 * 60, endMin: 22 * 60, work: true }, // Fri
  { startMin: 9 * 60, endMin: 22 * 60 }, // Sat
]
export const WEEKDAY_HOURS = BOOKABLE_HOURS[1]
export const WEEKEND_HOURS = BOOKABLE_HOURS[6]
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

/** The bookable window of the day `date` falls on, in Yiyi's time. */
export function hoursOn(date: Date, tz = YIYI_TZ) {
  const p = zonedParts(date, tz)
  return BOOKABLE_HOURS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]
}

/** True if [start, end) starts and ends inside the bookable window of the day it starts on. */
export function isBookable(start: number, end: number, tz = YIYI_TZ) {
  const a = start + tzOffsetMs(new Date(start), tz)
  const b = end + tzOffsetMs(new Date(end), tz)
  const day = Math.floor(a / DAY_MS) * DAY_MS
  const w = BOOKABLE_HOURS[new Date(day).getUTCDay()]
  return a >= day + w.startMin * 60e3 && b <= day + w.endMin * 60e3
}

/** Long plans (5h+) only start in the morning; everything ends when the day's window closes. */
export function latestStartMin(durationMin: number, w: Window) {
  const cap = durationMin >= MORNING_ONLY_FROM_MIN ? LATEST_MORNING_START_MIN : w.endMin
  return Math.min(cap, w.endMin - durationMin)
}

/** Whether a plan this long fits into a weekday evening. */
export function fitsOnWeekdays(durationMin: number) {
  return latestStartMin(durationMin, WEEKDAY_HOURS) >= WEEKDAY_HOURS.startMin
}

/** "7 PM", "9:30 AM". */
export function clockLabel(min: number) {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}

export const windowLabel = (w: Window) => `${clockLabel(w.startMin)}–${clockLabel(w.endMin)}`

export type SlotOption = Slot & { minutes: number; past: boolean; busy: boolean }

export function buildSlots(day: Day, durationMin: number, now: Date, busy: Busy[] = [], tz = YIYI_TZ): SlotOption[] {
  const out: SlotOption[] = []
  const lead = now.getTime() + LEAD_MIN * 60e3
  const w = BOOKABLE_HOURS[day.weekday]
  for (let min = w.startMin; min <= latestStartMin(durationMin, w); min += STEP_MIN) {
    const start = zonedToUtc(day.y, day.m, day.d, min, tz)
    const end = new Date(start.getTime() + durationMin * 60e3)
    if (!isBookable(start.getTime(), end.getTime(), tz)) continue
    out.push({
      start, end, minutes: min,
      past: start.getTime() < lead,
      busy: overlaps(start.getTime(), end.getTime(), busy),
    })
  }
  return out
}

/** "2026-11-07" for the day `date` falls on in `tz`. */
export function dayKeyOf(date: Date, tz = YIYI_TZ) {
  const p = zonedParts(date, tz)
  return `${monthKey({ y: p.y, m: p.m })}-${String(p.d).padStart(2, '0')}`
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
