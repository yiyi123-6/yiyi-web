import { useMemo, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarClock, Check, Loader2, RotateCw, Send } from 'lucide-react'
import { site } from '../data/content'
import { confettiFrom } from '../lib/confetti'
import { YIYI_TZ, dayLabel, localTz, timeLabel, whenLines, type Slot } from '../lib/calendar'
import { InviteError, canSendDirectly, isEmail, sendInvite } from '../lib/invite'
import { SlotPicker } from './SlotPicker'

export type Booking = {
  /** Short name for the calendar event, e.g. "All-day mountain hike". */
  activity: string
  durationMin: number
}

type Props = {
  subject: string
  message: string
  source: string
  /** Controlled message (e.g. the Connect page edits it in its own textarea). */
  onMessageChange?: (m: string) => void
  showMessage?: boolean
  name?: string
  onNameChange?: (n: string) => void
  tone?: 'light' | 'blush'
  /** Adds the date & time picker. */
  booking?: Booking
}

/** Sends an invite straight to Yiyi's Gmail. Falls back to a mailto link if the relay is unreachable. */
export function InviteForm({ subject, message, source, onMessageChange, showMessage = true, name: nameProp, onNameChange, tone = 'light', booking }: Props) {
  const [localName, setLocalName] = useState('')
  const [email, setEmail] = useState('')
  const [localMessage, setLocalMessage] = useState(message)
  const [slots, setSlots] = useState<Slot[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')
  const [relayDown, setRelayDown] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const visitorTz = useMemo(localTz, [])

  const name = nameProp ?? localName
  const setName = onNameChange ?? setLocalName
  const msg = onMessageChange ? message : localMessage
  const setMsg = onMessageChange ?? setLocalMessage
  const field = `w-full rounded-2xl border-2 border-ink px-4 py-2.5 outline-none focus:bg-cream ${tone === 'blush' ? 'bg-blush' : 'bg-cream'}`

  const timed = slots.length > 0
  const fullSubject = slots.length === 1
    ? `${subject} · ${dayLabel(slots[0].start, YIYI_TZ)}, ${timeLabel(slots[0].start, YIYI_TZ)}`
    : slots.length > 1 ? `${subject} · ${slots.length} time options` : subject
  const signed = name.trim() ? `${msg}\n\n— ${name.trim()}` : msg
  const body = timed ? `${signed}\n\n${whenLines(slots, visitorTz)}` : signed
  const pickSlots = (s: Slot[]) => {
    setSlots(s)
    if (status === 'error') setStatus('idle')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isEmail(email)) {
      setStatus('error')
      setError(`Add your email so ${site.name} can reply.`)
      return
    }
    if (!canSendDirectly) return
    setStatus('sending')
    setError('')
    try {
      await sendInvite({
        subject: fullSubject,
        message: body,
        name: name.trim(),
        replyTo: email.trim(),
        source,
        ...(timed && booking
          ? { activity: booking.activity, slots: slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })), timeZone: visitorTz }
          : {}),
      })
      setStatus('sent')
      confettiFrom(btn.current)
    } catch (err) {
      setStatus('error')
      if (err instanceof InviteError && err.code === 'conflict') {
        const taken = new Set(err.conflicts.map((c) => Date.parse(c)))
        const left = taken.size ? slots.filter((s) => !taken.has(s.start.getTime())) : []
        setSlots(left)
        setRefreshKey((k) => k + 1)
        setError(slots.length - left.length > 1 ? 'Oops, some of those times just got booked. Pick others ♡' : 'Oops, that time just got booked. Pick another one ♡')
      } else if (err instanceof InviteError && (err.code === 'invalid' || err.code === 'work' || err.code === 'hours')) {
        setError(err.message)
      } else {
        setRelayDown(true)
        setError(`Couldn't reach ${site.name}'s calendar just now. Give it a moment and try again ♡`)
      }
    }
  }

  if (status === 'sent') {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl border-2 border-ink bg-hot p-4 text-cream" role="status">
        <p className="flex items-center gap-2 font-display text-2xl font-black"><Check /> {timed ? 'Request sent!' : 'Invite sent!'}</p>
        {slots.length > 1 ? (
          <p className="text-sm opacity-90">
            {site.name} will pick one of your {slots.length} times and you'll get a Google Calendar invite at {email.trim()} ♡
          </p>
        ) : timed ? (
          <p className="text-sm opacity-90">
            {site.name} has the time on hold and will confirm it. You'll get a Google Calendar invite at {email.trim()} when she accepts ♡
          </p>
        ) : (
          <p className="text-sm opacity-90">It's in {site.name}'s inbox. She'll reply to {email.trim()} ♡</p>
        )}
      </motion.div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {showMessage && (
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wider text-ink/60">Your message</span>
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} className={`${field} mt-1 resize-y`} />
        </label>
      )}
      {booking && (
        <SlotPicker value={slots} onChange={pickSlots} defaultDurationMin={booking.durationMin} refreshKey={refreshKey} />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wider text-ink/60">Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" className={`${field} mt-1`} />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wider text-ink/60">Your email (for her reply)</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            aria-invalid={status === 'error' && !isEmail(email)}
            className={`${field} mt-1`}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {canSendDirectly ? (
          <button ref={btn} type="submit" disabled={status === 'sending'} className="btn-hot">
            {status === 'sending'
              ? <><Loader2 size={18} className="animate-spin" /> Sending…</>
              : relayDown
                ? <><RotateCw size={18} /> Try again</>
                : <><Send size={18} /> {slots.length > 1 ? `Send ${slots.length} times to ${site.name}` : timed ? `Request this time with ${site.name}` : `Send invite to ${site.name}`}</>}
          </button>
        ) : (
          <p className="flex items-center gap-2 rounded-full border-2 border-dashed border-ink/40 bg-blush px-4 py-2.5 text-sm font-semibold" role="status" data-testid="booking-soon">
            <CalendarClock size={18} className="shrink-0 text-hot" /> Booking opens soon ♡ {site.name} is setting up her calendar
          </p>
        )}
        <AnimatePresence>
          {status === 'error' && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm font-semibold text-berry" role="alert">
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </form>
  )
}
