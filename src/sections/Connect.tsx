import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Copy, Mail } from 'lucide-react'
import { BackHome } from '../components/Bits'
import { InviteForm } from '../components/InviteForm'
import { GithubIcon, InstagramIcon, LinkedinIcon } from '../components/BrandIcons'
import { connect, links, site } from '../data/content'

export function Connect() {
  const [selected, setSelected] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)
  const option = connect.options.find((o) => o.id === selected)

  const choose = (id: string) => {
    const o = connect.options.find((x) => x.id === id)!
    setSelected(id)
    setMessage(o.message)
    setCopied(false)
  }

  const signed = name.trim() ? `${message}\n\n— ${name.trim()}` : message

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(signed)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <section className="relative min-h-[80vh] overflow-hidden bg-berry text-cream">
      <div className="dots absolute inset-0 opacity-10" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-8 md:px-8">
        <BackHome />
        <p className="mt-10 font-hand text-2xl text-baby">no forms, no captchas, just vibes</p>
        <h1 className="font-display text-[clamp(2.8rem,8vw,7rem)] font-black leading-[0.88] tracking-[-0.04em]">
          What's our next <span className="italic text-hot [-webkit-text-stroke:2px_#FFFDF8]">adventure?</span>
        </h1>

        <fieldset className="mt-10">
          <legend className="mb-4 text-lg font-semibold text-cream/80">Pick your destination:</legend>
          <div className="flex flex-wrap gap-3">
            {connect.options.map((o, i) => {
              const on = selected === o.id
              return (
                <motion.button
                  key={o.id}
                  onClick={() => choose(o.id)}
                  aria-pressed={on}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  whileHover={{ y: -4, rotate: i % 2 ? 2 : -2 }}
                  whileTap={{ scale: 0.95 }}
                  className={`rounded-full border-2 border-ink px-5 py-3 text-lg font-bold shadow-[var(--shadow-sticker)] transition-colors ${
                    on ? 'bg-hot text-cream' : 'bg-cream text-ink hover:bg-baby'
                  }`}
                >
                  <span aria-hidden className="mr-2">{o.emoji}</span>
                  {o.label}
                </motion.button>
              )
            })}
          </div>
        </fieldset>

        <AnimatePresence mode="wait">
          {option ? (
            <motion.div
              key={option.id}
              initial={{ opacity: 0, y: 30, rotate: -1 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mt-12 grid overflow-hidden rounded-[1.75rem] border-[3px] border-ink bg-cream text-ink shadow-[10px_10px_0_0_#21151D] md:grid-cols-[1fr_15rem]"
            >
              <div className="p-6 md:p-8">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-xs uppercase tracking-[0.25em] text-ink/50">Boarding pass · adventure class</p>
                  <span className="chip">{option.emoji} {option.label}</span>
                </div>
                <label className="mt-5 block">
                  <span className="text-sm font-bold uppercase tracking-wider text-ink/60">Your suggested message (edit away)</span>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    className="mt-2 w-full resize-y rounded-2xl border-2 border-ink bg-blush p-4 text-lg leading-relaxed outline-none focus:bg-cream"
                  />
                </label>
                <div className="mt-4">
                  <InviteForm
                    key={option.id}
                    source="Connect page on Yiyi's Universe"
                    subject={option.subject}
                    message={message}
                    onMessageChange={setMessage}
                    showMessage={false}
                    name={name}
                    onNameChange={setName}
                    tone="blush"
                  />
                </div>
                <button onClick={copy} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-ink/60 underline-offset-2 hover:underline">
                  {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> or copy the message</>}
                </button>
              </div>
              <div className="relative flex flex-col justify-between gap-6 border-t-[3px] border-dashed border-ink bg-baby p-6 md:border-l-[3px] md:border-t-0">
                <span className="absolute -left-4 -top-4 hidden h-8 w-8 rounded-full border-[3px] border-ink bg-berry md:block" aria-hidden />
                <span className="absolute -bottom-4 -left-4 hidden h-8 w-8 rounded-full border-[3px] border-ink bg-berry md:block" aria-hidden />
                <div>
                  <p className="text-xs font-bold uppercase text-ink/50">From</p>
                  <p className="font-display text-2xl font-black">{name.trim() || 'You ♡'}</p>
                  <p className="mt-3 text-xs font-bold uppercase text-ink/50">To</p>
                  <p className="font-display text-2xl font-black">{site.name}</p>
                  <p className="mt-3 text-xs font-bold uppercase text-ink/50">Destination</p>
                  <p className="font-semibold">{option.subject}</p>
                </div>
                <div className="flex h-12 items-end gap-[3px]" aria-hidden>
                  {Array.from({ length: 28 }, (_, i) => (
                    <span key={i} className="flex-1 bg-ink" style={{ height: `${40 + ((i * 37) % 60)}%` }} />
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.p key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-12 font-hand text-3xl text-baby">
              ↑ choose one and I'll write the first line for you
            </motion.p>
          )}
        </AnimatePresence>

        <div className="mt-16 flex flex-wrap items-center gap-3">
          <span className="mr-2 font-semibold text-cream/70">Or find me here:</span>
          <a href={links.linkedin} target="_blank" rel="noreferrer" className="btn-cream"><LinkedinIcon size={18} /> LinkedIn</a>
          <a href={links.instagram} target="_blank" rel="noreferrer" className="btn-cream"><InstagramIcon size={18} /> {links.instagramHandle}</a>
          <a href={links.github} target="_blank" rel="noreferrer" className="btn-cream"><GithubIcon size={18} /> GitHub</a>
          <a href={`mailto:${links.email}`} className="btn-ink"><Mail size={18} /> {links.email}</a>
        </div>
      </div>
    </section>
  )
}
