import { useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Loader2, Mail, Send } from 'lucide-react'
import { site } from '../data/content'
import { confettiFrom } from '../lib/confetti'
import { canSendDirectly, isEmail, mailtoFor, sendInvite } from '../lib/invite'

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
}

/** Sends an invite straight to Yiyi's Gmail. Falls back to a mailto link if the relay is unreachable. */
export function InviteForm({ subject, message, source, onMessageChange, showMessage = true, name: nameProp, onNameChange, tone = 'light' }: Props) {
  const [localName, setLocalName] = useState('')
  const [email, setEmail] = useState('')
  const [localMessage, setLocalMessage] = useState(message)
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')
  const btn = useRef<HTMLButtonElement>(null)

  const name = nameProp ?? localName
  const setName = onNameChange ?? setLocalName
  const msg = onMessageChange ? message : localMessage
  const setMsg = onMessageChange ?? setLocalMessage
  const field = `w-full rounded-2xl border-2 border-ink px-4 py-2.5 outline-none focus:bg-cream ${tone === 'blush' ? 'bg-blush' : 'bg-cream'}`

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isEmail(email)) {
      setStatus('error')
      setError(`Add your email so ${site.name} can reply.`)
      return
    }
    const body = name.trim() ? `${msg}\n\n— ${name.trim()}` : msg
    if (!canSendDirectly) {
      window.location.href = mailtoFor(subject, body)
      return
    }
    setStatus('sending')
    setError('')
    try {
      await sendInvite({ subject, message: body, name: name.trim(), replyTo: email.trim(), source })
      setStatus('sent')
      confettiFrom(btn.current)
    } catch {
      setStatus('error')
      setError("Couldn't reach the mail relay.")
    }
  }

  if (status === 'sent') {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl border-2 border-ink bg-hot p-4 text-cream" role="status">
        <p className="flex items-center gap-2 font-display text-2xl font-black"><Check /> Invite sent!</p>
        <p className="text-sm opacity-90">It's in {site.name}'s inbox. She'll reply to {email.trim()} ♡</p>
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
          {status === 'sending' ? <><Loader2 size={18} className="animate-spin" /> Sending…</> : <><Send size={18} /> Send invite to {site.name}</>}
        </button>
        <AnimatePresence>
          {status === 'error' && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm font-semibold text-berry" role="alert">
              {error}{' '}
              {error.startsWith("Couldn't") && (
                <a href={mailtoFor(subject, msg)} className="inline-flex items-center gap-1 underline">
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
