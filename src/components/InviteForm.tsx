import { useMemo, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarPlus, Check, Download, Loader2, Mail, Send } from 'lucide-react'
import { links, site } from '../data/content'
import { confettiFrom } from '../lib/confetti'
import { YIYI_TZ, dayLabel, googleCalendarUrl, icsFor, localTz, timeLabel, whenLines, type Slot } from '../lib/calendar'
import { InviteError, canSendDirectly, isEmail, mailtoFor, sendInvite } from '../lib/invite'
import { SlotPicker } from './SlotPicker'

export type Booking = {
  /** Short name for the calendar event, e.g. "All-day mountain hike". */
  activity: string
  durationMin: number
  /** Nudges visitors to pick a time (still optional). */
  encouraged?: boolean
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
  const [slot, setSlot] = useState<Slot | null>(null)
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

  const fullSubject = slot ? `${subject} · ${dayLabel(slot.start, YIYI_TZ)}, ${timeLabel(slot.start, YIYI_TZ)}` : subject
  const signed = name.trim() ? `${msg}\n\n— ${name.trim()}` : msg
  const body = slot ? `${signed}\n\n${whenLines(slot, visitorTz)}` : signed
  const event = slot && booking
    ? { title: `${booking.activity} with ${site.name} ♡`, details: `${signed}\n\nSent via ${source}`, slot, guest: links.email }
    : null

  const pickSlot = (s: Slot | null) => {
    setSlot(s)
    if (status === 'error') setStatus('idle')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isEmail(email)) {
      setStatus('error')
      setError(`Add your email so ${site.name} can reply.`)
      return
    }
    if (!canSendDirectly) {
      window.location.href = mailtoFor(fullSubject, body)
      return
    }
    setStatus('sending')
    setError('')
    try {
      await sendInvite({
        subject: fullSubject,
        message: body,
        name: name.trim(),
        replyTo: email.trim(),
        source,
        ...(slot && booking ? { activity: booking.activity, start: slot.start.toISOString(), end: slot.end.toISOString(), timeZone: visitorTz } : {}),
      })
      setStatus('sent')
      confettiFrom(btn.current)
    } catch (err) {
      setStatus('error')
      if (err instanceof InviteError && err.code === 'conflict') {
        setSlot(null)
        setRefreshKey((k) => k + 1)
        setError('Oops, that time just got booked. Pick another one ♡')
      } else if (err instanceof InviteError && err.code === 'invalid') {
        setError(err.message)
      } else {
        setRelayDown(true)
        setError("Couldn't reach the mail relay.")
      }
    }
  }

  if (status === 'sent') {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl border-2 border-ink bg-hot p-4 text-cream" role="status">
        <p className="flex items-center gap-2 font-display text-2xl font-black"><Check /> {slot ? 'Request sent!' : 'Invite sent!'}</p>
        {slot ? (
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
        <SlotPicker value={slot} onChange={pickSlot} defaultDurationMin={booking.durationMin} refreshKey={refreshKey} encouraged={booking.encouraged} />
      )}
      {event && (!canSendDirectly || relayDown) && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-dashed border-ink/30 p-3 text-sm" data-testid="calendar-links">
          <span className="w-full font-semibold sm:w-auto">Make it official:</span>
          <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer" className="btn-cream !px-3 !py-1.5 text-sm">
            <CalendarPlus size={16} /> Add to Google Calendar
          </a>
          <a
            href={`data:text/calendar;charset=utf-8,${encodeURIComponent(icsFor(event))}`}
            download={`plans-with-${site.name.toLowerCase()}.ics`}
            className="btn-cream !px-3 !py-1.5 text-sm"
          >
            <Download size={16} /> .ics
          </a>
          <span className="w-full text-xs text-ink/55">Adds {site.name} ({links.email}) as a guest, so she gets a real calendar invite to accept.</span>
        </div>
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
        <button ref={btn} type="submit" disabled={status === 'sending'} className="btn-hot">
          {status === 'sending'
            ? <><Loader2 size={18} className="animate-spin" /> Sending…</>
            : <><Send size={18} /> {slot ? `Request this time with ${site.name}` : `Send invite to ${site.name}`}</>}
        </button>
        <AnimatePresence>
          {status === 'error' && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm font-semibold text-berry" role="alert">
              {error}{' '}
              {relayDown && (
                <a href={mailtoFor(fullSubject, body)} className="inline-flex items-center gap-1 underline">
                  <Mail size={14} /> send it from your email app instead
                </a>
              )}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </form>
  )
}
