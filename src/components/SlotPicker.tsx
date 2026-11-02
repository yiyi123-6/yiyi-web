import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarHeart, Check, Clock, Loader2, X } from 'lucide-react'
import { site } from '../data/content'
import {
  BOOKING_DAYS, DURATIONS_MIN, MAX_DURATION_MIN, YIYI_TZ, buildDays, buildSlots, dayLabel, describeSlot, durationLabel, localTz, sameClock, timeLabel,
  type Busy, type Day, type Slot,
} from '../lib/calendar'
import { canSendDirectly, fetchAvailability } from '../lib/invite'

type Props = {
  value: Slot | null
  onChange: (slot: Slot | null) => void
  defaultDurationMin: number
  /** Bump to refetch availability (e.g. after the relay says a slot was just taken). */
  refreshKey?: number
  encouraged?: boolean
}

type Load = { state: 'off' } | { state: 'loading' } | { state: 'ok'; busy: Busy[] } | { state: 'error' }

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** Pick a day and a start time. Busy blocks from Yiyi's calendars are greyed out (never with details). */
export function SlotPicker({ value, onChange, defaultDurationMin, refreshKey = 0, encouraged }: Props) {
  const [now] = useState(() => new Date())
  const visitorTz = useMemo(localTz, [])
  const differs = !sameClock(visitorTz, YIYI_TZ, now)
  const [duration, setDuration] = useState(() => Math.min(MAX_DURATION_MIN, Math.max(30, Math.round(defaultDurationMin / 30) * 30)))
  const [dayKey, setDayKey] = useState<string | null>(null)
  const [load, setLoad] = useState<Load>(canSendDirectly ? { state: 'loading' } : { state: 'off' })

  useEffect(() => {
    if (!canSendDirectly) return
    const ctrl = new AbortController()
    setLoad({ state: 'loading' })
    const from = new Date()
    const to = new Date(from.getTime() + (BOOKING_DAYS + 1) * 86400e3)
    fetchAvailability(from, to, ctrl.signal)
      .then((a) => setLoad({ state: 'ok', busy: a.busy }))
      .catch(() => { if (!ctrl.signal.aborted) setLoad({ state: 'error' }) })
    return () => ctrl.abort()
  }, [refreshKey])

  const busy = useMemo(() => (load.state === 'ok' ? load.busy : []), [load])
  const days = useMemo(() => buildDays(now), [now])
  const slotsByDay = useMemo(() => {
    const m = new Map<string, ReturnType<typeof buildSlots>>()
    for (const d of days) m.set(d.key, buildSlots(d, duration, now, busy).filter((s) => !s.past))
    return m
  }, [days, duration, now, busy])
  const freeDay = (d: Day) => (slotsByDay.get(d.key) ?? []).some((s) => !s.busy)

  const durations = useMemo(() => [...new Set([...DURATIONS_MIN, duration])].sort((a, b) => a - b), [duration])
  const daySlots = dayKey ? slotsByDay.get(dayKey) ?? [] : []
  const selectedDay = days.find((d) => d.key === dayKey)

  useEffect(() => {
    if (!value) return
    const match = [...slotsByDay.values()].flat().find((s) => s.start.getTime() === value.start.getTime())
    if (!match || match.busy) onChange(null)
    else if (match.end.getTime() !== value.end.getTime()) onChange({ start: match.start, end: match.end })
  }, [slotsByDay])

  const pad = days[0].weekday
  const monthTitle = [...new Set(days.map((d) => dayLabel(new Date(Date.UTC(d.y, d.m - 1, d.d, 12)), 'UTC', { month: 'long' })))].join(' – ')

  return (
    <div className="rounded-2xl border-2 border-ink bg-cream p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-display text-xl font-black">
            <CalendarHeart size={20} className="text-hot" /> {encouraged ? 'Pick a day & time' : 'Got a time in mind?'}
            {!encouraged && <span className="text-sm font-semibold text-ink/50">(optional)</span>}
          </p>
          <p className="text-xs text-ink/60">
            Times are in {site.name}'s time (Toronto){differs && <> · you'll see yours too ({visitorTz.replace(/_/g, ' ')})</>}
          </p>
        </div>
        <AvailabilityBadge load={load} />
      </div>

      <label className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold">
        <Clock size={16} className="text-berry" /> How long?
        <select
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className="rounded-full border-2 border-ink bg-blush px-3 py-1 font-semibold outline-none focus:bg-cream"
        >
          {durations.map((d) => <option key={d} value={d}>{durationLabel(d)}</option>)}
        </select>
        {duration >= 300 && <span className="text-xs font-normal text-ink/50">big days start in the morning</span>}
      </label>

      <div className="mt-4">
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-ink/60">{monthTitle}</p>
        <div className="grid grid-cols-7 gap-1 text-center" role="group" aria-label="Pick a day">
          {WEEKDAYS.map((w, i) => <span key={i} className="text-[0.65rem] font-bold text-ink/40" aria-hidden>{w}</span>)}
          {Array.from({ length: pad }, (_, i) => <span key={`pad-${i}`} aria-hidden />)}
          {days.map((d) => {
            const on = d.key === dayKey
            const free = freeDay(d)
            const label = dayLabel(new Date(Date.UTC(d.y, d.m - 1, d.d, 12)), 'UTC', { weekday: 'long', month: 'long', day: 'numeric' })
            return (
              <button
                key={d.key}
                type="button"
                disabled={!free}
                onClick={() => setDayKey(d.key)}
                aria-pressed={on}
                aria-label={`${label}${free ? '' : ' (no free times)'}`}
                data-day={d.key}
                className={`relative aspect-square min-w-0 rounded-xl border-2 text-sm font-bold transition sm:aspect-[4/3] ${
                  on
                    ? 'border-ink bg-hot text-cream shadow-[2px_2px_0_0_#21151D]'
                    : free
                      ? 'border-ink/15 bg-blush hover:border-ink hover:bg-baby'
                      : 'cursor-not-allowed border-transparent bg-ink/5 text-ink/25 line-through'
                }`}
              >
                {d.d === 1 && <span className="absolute left-1 top-0.5 text-[0.55rem] font-bold uppercase opacity-70">{dayLabel(new Date(Date.UTC(d.y, d.m - 1, 1, 12)), 'UTC', { month: 'short' })}</span>}
                {d.d}
              </button>
            )
          })}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {selectedDay && (
          <motion.div key={selectedDay.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink/60">
              Start time · {dayLabel(new Date(Date.UTC(selectedDay.y, selectedDay.m - 1, selectedDay.d, 12)), 'UTC', { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5" role="listbox" aria-label="Pick a start time">
              {daySlots.map((s) => {
                const on = value?.start.getTime() === s.start.getTime()
                return (
                  <button
                    key={s.minutes}
                    type="button"
                    role="option"
                    aria-selected={on}
                    disabled={s.busy}
                    data-slot={s.start.toISOString()}
                    data-busy={s.busy || undefined}
                    onClick={() => onChange({ start: s.start, end: s.end })}
                    className={`min-w-0 rounded-xl border-2 px-1 py-1.5 text-center leading-tight transition ${
                      on
                        ? 'border-ink bg-hot text-cream shadow-[2px_2px_0_0_#21151D]'
                        : s.busy
                          ? 'cursor-not-allowed border-dashed border-ink/20 bg-ink/5 text-ink/30'
                          : 'border-ink/20 bg-blush hover:border-ink hover:bg-baby'
                    }`}
                  >
                    <span className={`block text-sm font-bold ${s.busy ? 'line-through' : ''}`}>{timeLabel(s.start, YIYI_TZ)}</span>
                    {s.busy ? (
                      <span className="block text-[0.65rem] font-semibold uppercase">busy</span>
                    ) : differs ? (
                      <span className={`block text-[0.65rem] ${on ? 'text-cream/85' : 'text-ink/50'}`}>you: {timeLabel(s.start, visitorTz)}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {value && (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="mt-4 flex items-start justify-between gap-3 rounded-2xl border-2 border-ink bg-baby p-3" data-testid="slot-summary">
          <div className="min-w-0 text-sm">
            <p className="flex items-center gap-1.5 font-bold"><Check size={16} className="shrink-0 text-berry" /> {describeSlot(value, YIYI_TZ)}</p>
            <p className="text-ink/60">{site.name}'s time, Toronto · {durationLabel(Math.round((value.end.getTime() - value.start.getTime()) / 60e3))}</p>
            {differs && <p className="mt-1 font-semibold">= {describeSlot(value, visitorTz)} <span className="font-normal text-ink/60">your time</span></p>}
          </div>
          <button type="button" onClick={() => onChange(null)} className="shrink-0 rounded-full p-1 hover:bg-cream" aria-label="Clear the time">
            <X size={16} />
          </button>
        </motion.div>
      )}
    </div>
  )
}

function AvailabilityBadge({ load }: { load: Load }) {
  if (load.state === 'off') return null
  if (load.state === 'loading') return <span className="chip !bg-blush !text-xs"><Loader2 size={12} className="animate-spin" /> checking her calendar…</span>
  if (load.state === 'error') return <span className="chip !bg-blush !text-xs" title="Pick any time, she'll confirm it">calendar offline · pick freely</span>
  return <span className="chip !text-xs"><span className="h-2 w-2 rounded-full bg-hot" /> live from her calendar</span>
}
