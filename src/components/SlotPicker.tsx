import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { BriefcaseBusiness, CalendarHeart, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Loader2, Pencil, Plus, X } from 'lucide-react'
import { site } from '../data/content'
import {
  DURATIONS_MIN, MAX_AHEAD_DAYS, MAX_DURATION_MIN, MAX_OPTIONS, WORK_HOURS_LABEL, YIYI_TZ,
  addMonths, buildSlots, compareMonths, dayLabel, describeSlot, durationLabel, fitsOnWeekdays, latestStartMin, localTz,
  minutesOfDay, monthDays, monthKey, monthOf, monthRange, overlaps, overlapsWorkHours, sameClock, timeLabel,
  type Busy, type Month, type Slot, type SlotOption,
} from '../lib/calendar'
import { canSendDirectly, fetchAvailability } from '../lib/invite'

type Props = {
  value: Slot[]
  onChange: (slots: Slot[]) => void
  defaultDurationMin: number
  /** Bump to refetch availability (e.g. after the relay says a slot was just taken). */
  refreshKey?: number
  encouraged?: boolean
}

type Load = { state: 'loading' } | { state: 'ok'; busy: Busy[] } | { state: 'error' }

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const noon = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12))
const sortSlots = (s: Slot[]) => [...s].sort((a, b) => a.start.getTime() - b.start.getTime())
const sameStart = (a: Slot, b: Slot) => a.start.getTime() === b.start.getTime()

/**
 * Folded by default. Opens to a month calendar where visitors pick up to MAX_OPTIONS start times.
 * Busy blocks from Yiyi's calendars and her work hours are greyed out (busy blocks never carry details).
 */
export function SlotPicker({ value, onChange, defaultDurationMin, refreshKey = 0, encouraged }: Props) {
  const [now] = useState(() => new Date())
  const visitorTz = useMemo(localTz, [])
  const differs = !sameClock(visitorTz, YIYI_TZ, now)
  const [open, setOpen] = useState(false)
  const [duration, setDuration] = useState(() => Math.min(MAX_DURATION_MIN, Math.max(30, Math.round(defaultDurationMin / 30) * 30)))
  const firstMonth = useMemo(() => monthOf(now), [now])
  const lastMonth = useMemo(() => monthOf(new Date(now.getTime() + MAX_AHEAD_DAYS * 86400e3)), [now])
  const [view, setView] = useState<Month>(firstMonth)
  const [dayKey, setDayKey] = useState<string | null>(null)
  const [loads, setLoads] = useState<Record<string, Load>>({})
  const viewKey = monthKey(view)
  const load = canSendDirectly ? loads[viewKey] ?? { state: 'loading' as const } : null

  const requested = useRef(new Set<string>())
  const generation = useRef(refreshKey)
  useEffect(() => {
    if (refreshKey === generation.current) return
    generation.current = refreshKey
    requested.current.clear()
    setLoads({})
  }, [refreshKey])

  useEffect(() => {
    if (!canSendDirectly || !open || requested.current.has(viewKey)) return
    requested.current.add(viewKey)
    const gen = generation.current
    const settle = (l: Load) => { if (gen === generation.current) setLoads((all) => ({ ...all, [viewKey]: l })) }
    const { from, to } = monthRange(view)
    fetchAvailability(from.getTime() < now.getTime() ? now : from, to)
      .then((a) => settle({ state: 'ok', busy: a.busy }))
      .catch(() => settle({ state: 'error' }))
  }, [open, viewKey, view, now, loads])

  const busy = useMemo(() => (load?.state === 'ok' ? load.busy : []), [load])
  const knownBusy = useMemo(() => Object.values(loads).flatMap((l) => (l.state === 'ok' ? l.busy : [])), [loads])
  const horizon = now.getTime() + MAX_AHEAD_DAYS * 86400e3

  const days = useMemo(() => monthDays(view), [view])
  const slotsByDay = useMemo(() => {
    const m = new Map<string, SlotOption[]>()
    for (const d of days) m.set(d.key, buildSlots(d, duration, now, busy).filter((s) => !s.past && s.start.getTime() <= horizon))
    return m
  }, [days, duration, now, busy, horizon])

  const isPicked = (s: Slot) => value.some((v) => sameStart(v, s))
  const clashes = (s: Slot) => value.some((v) => !sameStart(v, s) && overlaps(s.start.getTime(), s.end.getTime(), [{ start: v.start.getTime(), end: v.end.getTime() }]))
  const full = value.length >= MAX_OPTIONS
  const dayStatus = (key: string, weekday: number) => {
    const slots = slotsByDay.get(key) ?? []
    if (!slots.length) return 'past' as const
    if (slots.every((s) => s.work)) return weekday > 0 && weekday < 6 ? ('work' as const) : ('full' as const)
    if (slots.some((s) => isPicked(s))) return 'picked' as const
    return slots.some((s) => !s.work && !s.busy && !clashes(s)) ? ('free' as const) : ('full' as const)
  }

  const durations = useMemo(() => [...new Set([...DURATIONS_MIN, duration])].sort((a, b) => a - b), [duration])
  const selectedDay = days.find((d) => d.key === dayKey)
  const daySlots = dayKey ? slotsByDay.get(dayKey) ?? [] : []

  const changeDuration = (min: number) => {
    setDuration(min)
    const kept: Slot[] = []
    for (const v of sortSlots(value)) {
      const s = { start: v.start, end: new Date(v.start.getTime() + min * 60e3) }
      const ok = minutesOfDay(s.start) <= latestStartMin(min)
        && !overlapsWorkHours(s.start.getTime(), s.end.getTime())
        && !overlaps(s.start.getTime(), s.end.getTime(), knownBusy)
        && !kept.some((k) => s.start.getTime() < k.end.getTime())
      if (ok) kept.push(s)
    }
    onChange(kept)
  }

  const toggle = (s: SlotOption) => {
    if (isPicked(s)) return onChange(value.filter((v) => !sameStart(v, s)))
    if (full) return
    onChange(sortSlots([...value, { start: s.start, end: s.end }]))
    setOpen(false)
  }

  const goMonth = (n: number) => {
    setView((v) => addMonths(v, n))
    setDayKey(null)
  }

  const chips = value.length > 0 && (
    <ul className="flex flex-wrap gap-2" aria-label="Your proposed times">
      {value.map((s, i) => (
        <li key={s.start.getTime()} data-testid="slot-chip" className="inline-flex max-w-full items-start gap-1 rounded-2xl border-2 border-ink bg-baby py-1 pl-3 pr-1 text-sm">
          <span className="min-w-0">
            <span className="block font-bold">{value.length > 1 && <span className="text-berry">#{i + 1} </span>}{describeSlot(s, YIYI_TZ, now)}</span>
            {differs && <span className="block text-xs text-ink/60">you: {describeSlot(s, visitorTz, now)}</span>}
          </span>
          <button type="button" onClick={() => onChange(value.filter((v) => !sameStart(v, s)))} className="shrink-0 rounded-full p-1 hover:bg-cream" aria-label={`Remove ${describeSlot(s, YIYI_TZ, now)}`}>
            <X size={14} />
          </button>
        </li>
      ))}
    </ul>
  )

  if (!open) {
    return (
      <div className="rounded-2xl border-2 border-ink bg-cream p-3" data-testid="slot-collapsed">
        {value.length === 0 ? (
          <button type="button" onClick={() => setOpen(true)} className="group flex w-full items-center gap-3 text-left" data-testid="open-picker" aria-expanded={false}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 border-ink bg-hot text-cream shadow-[2px_2px_0_0_#21151D] transition group-hover:-translate-y-0.5">
              <CalendarHeart size={20} />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-lg font-black leading-tight">
                {encouraged ? 'Pick a date & time' : 'Suggest a date & time'}
                {!encouraged && <span className="ml-1 text-sm font-semibold text-ink/50">(optional)</span>}
              </span>
              <span className="block text-xs text-ink/60">Offer up to {MAX_OPTIONS} times and {site.name} picks the one that works ♡</span>
            </span>
            <ChevronDown size={18} className="ml-auto shrink-0 text-ink/50" />
          </button>
        ) : (
          <>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink/60">
              <CalendarHeart size={14} className="text-hot" />
              {value.length === 1 ? 'Your proposed time' : `Your ${value.length} proposed times`} · {durationLabel(duration)} each
            </p>
            {chips}
            <div className="mt-3 flex flex-wrap gap-2">
              {!full && (
                <button type="button" onClick={() => setOpen(true)} className="btn-cream !px-3 !py-1.5 text-sm" data-testid="add-another">
                  <Plus size={15} /> add another time
                </button>
              )}
              <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 px-2 text-sm font-semibold text-ink/60 underline-offset-2 hover:underline">
                <Pencil size={13} /> change
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  const atFirst = compareMonths(view, firstMonth) <= 0
  const atLast = compareMonths(view, lastMonth) >= 0
  const pad = days[0].weekday

  return (
    <div className="rounded-2xl border-2 border-ink bg-cream p-4" data-testid="slot-picker">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-display text-xl font-black">
            <CalendarHeart size={20} className="text-hot" /> {value.length ? 'Add another time' : encouraged ? 'Pick a date & time' : 'Suggest a date & time'}
          </p>
          <p className="text-xs text-ink/60">
            Times are in {site.name}'s time (Toronto){differs && <> · you'll see yours too ({visitorTz.replace(/_/g, ' ')})</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {load && <AvailabilityBadge load={load} />}
          <button type="button" onClick={() => setOpen(false)} className="btn-cream !px-3 !py-1 text-sm" data-testid="close-picker">
            {value.length ? <><Check size={15} /> Done</> : <><X size={15} /> Close</>}
          </button>
        </div>
      </div>

      {chips && <div className="mt-3">{chips}</div>}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <Clock size={16} className="text-berry" /> How long?
          <select
            value={duration}
            onChange={(e) => changeDuration(Number(e.target.value))}
            className="rounded-full border-2 border-ink bg-blush px-3 py-1 font-semibold outline-none focus:bg-cream"
          >
            {durations.map((d) => <option key={d} value={d}>{durationLabel(d)}</option>)}
          </select>
        </label>
        {duration >= 300 && <span className="text-xs text-ink/50">big days start in the morning</span>}
      </div>
      {fitsOnWeekdays(duration) ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-ink/60" data-testid="work-note">
          <BriefcaseBusiness size={14} className="mt-px shrink-0 text-berry" /> {WORK_HOURS_LABEL} (Toronto) is work time. Mornings, evenings and weekends are open ♡
        </p>
      ) : (
        <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-baby px-3 py-2 text-sm font-semibold" data-testid="work-note">
          <BriefcaseBusiness size={16} className="mt-0.5 shrink-0 text-berry" /> Weekdays are work days for {site.name}, so big adventures live on weekends ♡
        </p>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <button type="button" onClick={() => goMonth(-1)} disabled={atFirst} className="rounded-full border-2 border-ink bg-blush p-1 transition hover:bg-baby disabled:opacity-25" aria-label="Previous month">
              <ChevronLeft size={16} />
            </button>
            <p className="font-display text-lg font-black" data-testid="month-label" aria-live="polite">
              {dayLabel(noon(view.y, view.m, 1), 'UTC', { month: 'long', year: 'numeric' })}
            </p>
            <button type="button" onClick={() => goMonth(1)} disabled={atLast} className="rounded-full border-2 border-ink bg-blush p-1 transition hover:bg-baby disabled:opacity-25" aria-label="Next month">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center" role="group" aria-label="Pick a day">
            {WEEKDAYS.map((w, i) => <span key={i} className="text-[0.65rem] font-bold text-ink/40" aria-hidden>{w}</span>)}
            {Array.from({ length: pad }, (_, i) => <span key={`pad-${i}`} aria-hidden />)}
            {days.map((d) => {
              const on = d.key === dayKey
              const status = dayStatus(d.key, d.weekday)
              const usable = status === 'free' || status === 'picked'
              const label = dayLabel(noon(d.y, d.m, d.d), 'UTC', { weekday: 'long', month: 'long', day: 'numeric' })
              const why = { past: ' (not available)', work: ' (work day)', full: ' (no free times)', free: '', picked: ' (has a picked time)' }[status]
              return (
                <button
                  key={d.key}
                  type="button"
                  disabled={!usable}
                  onClick={() => setDayKey(d.key)}
                  aria-pressed={on}
                  aria-label={`${label}${why}`}
                  title={status === 'work' ? 'Work day' : undefined}
                  data-day={d.key}
                  data-status={status}
                  className={`relative h-10 min-w-0 rounded-xl border-2 text-sm font-bold transition ${
                    on
                      ? 'border-ink bg-hot text-cream shadow-[2px_2px_0_0_#21151D]'
                      : usable
                        ? 'border-ink/15 bg-blush hover:border-ink hover:bg-baby'
                        : status === 'work'
                          ? 'cursor-not-allowed border-transparent bg-[repeating-linear-gradient(135deg,rgb(33_21_29/0.05)_0_4px,transparent_4px_8px)] text-ink/30'
                          : 'cursor-not-allowed border-transparent bg-ink/5 text-ink/25 line-through'
                  }`}
                >
                  {d.d}
                  {status === 'picked' && <span className={`absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${on ? 'bg-cream' : 'bg-hot'}`} aria-hidden />}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <AnimatePresence initial={false} mode="wait">
            {selectedDay ? (
              <motion.div key={selectedDay.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink/60">
                  Start time · {dayLabel(noon(selectedDay.y, selectedDay.m, selectedDay.d), 'UTC', { weekday: 'long', month: 'short', day: 'numeric' })}
                </p>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-3 xl:grid-cols-4" role="listbox" aria-label="Pick a start time" aria-multiselectable>
                  {groupWork(daySlots).map((g) =>
                    g.kind === 'work' ? (
                      <div key={`work-${g.slots[0].minutes}`} data-work-block className="col-span-full flex items-center gap-2 rounded-xl border-2 border-dashed border-ink/20 bg-ink/5 px-3 py-1.5 text-xs font-semibold text-ink/45">
                        <BriefcaseBusiness size={14} className="shrink-0" />
                        {timeLabel(g.slots[0].start, YIYI_TZ)}{g.slots.length > 1 && <> – {timeLabel(g.slots.at(-1)!.start, YIYI_TZ)}</>} · work hours
                      </div>
                    ) : (
                      <SlotButton key={g.slot.minutes} s={g.slot} picked={isPicked(g.slot)} clash={clashes(g.slot)} full={full} differs={differs} visitorTz={visitorTz} onClick={() => toggle(g.slot)} />
                    ),
                  )}
                </div>
                {full && <p className="mt-2 text-xs font-semibold text-berry">That's {MAX_OPTIONS} times, the max. Remove one to pick another.</p>}
              </motion.div>
            ) : (
              <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid h-full min-h-24 place-items-center rounded-2xl border-2 border-dashed border-ink/20 p-4 text-center font-hand text-2xl text-berry">
                pick a day to see start times ♡
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

type Group = { kind: 'work'; slots: SlotOption[] } | { kind: 'slot'; slot: SlotOption }

/** Folds runs of work-hours starts into one "work hours" row so the grid stays readable. */
function groupWork(slots: SlotOption[]): Group[] {
  const out: Group[] = []
  for (const s of slots) {
    const last = out[out.length - 1]
    if (s.work && last?.kind === 'work') last.slots.push(s)
    else out.push(s.work ? { kind: 'work', slots: [s] } : { kind: 'slot', slot: s })
  }
  return out
}

function SlotButton({ s, picked, clash, full, differs, visitorTz, onClick }: {
  s: SlotOption; picked: boolean; clash: boolean; full: boolean; differs: boolean; visitorTz: string; onClick: () => void
}) {
  const blocked = s.busy || clash
  return (
    <button
      type="button"
      role="option"
      aria-selected={picked}
      disabled={!picked && (blocked || full)}
      data-slot={s.start.toISOString()}
      data-busy={s.busy || undefined}
      onClick={onClick}
      className={`min-w-0 rounded-xl border-2 px-1 py-1.5 text-center leading-tight transition ${
        picked
          ? 'border-ink bg-hot text-cream shadow-[2px_2px_0_0_#21151D]'
          : blocked
            ? 'cursor-not-allowed border-dashed border-ink/20 bg-ink/5 text-ink/30'
            : 'border-ink/20 bg-blush hover:border-ink hover:bg-baby disabled:opacity-40'
      }`}
    >
      <span className={`block text-sm font-bold ${blocked ? 'line-through' : ''}`}>{timeLabel(s.start, YIYI_TZ)}</span>
      {s.busy ? (
        <span className="block text-[0.65rem] font-semibold uppercase">busy</span>
      ) : clash ? (
        <span className="block text-[0.65rem] font-semibold uppercase">overlaps</span>
      ) : differs ? (
        <span className={`block text-[0.65rem] ${picked ? 'text-cream/85' : 'text-ink/50'}`}>you: {timeLabel(s.start, visitorTz)}</span>
      ) : null}
    </button>
  )
}

function AvailabilityBadge({ load }: { load: Load }) {
  if (load.state === 'loading') return <span className="chip !bg-blush !text-xs"><Loader2 size={12} className="animate-spin" /> checking her calendar…</span>
  if (load.state === 'error') return <span className="chip !bg-blush !text-xs" title="Pick any time, she'll confirm it">calendar offline · pick freely</span>
  return <span className="chip !text-xs"><span className="h-2 w-2 rounded-full bg-hot" /> live from her calendar</span>
}
