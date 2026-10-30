import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Heart, Mail, X } from 'lucide-react'
import { about, links, site } from '../data/content'
import { confettiFrom } from '../lib/confetti'
import { useUniverse } from '../lib/universe'
import { GithubIcon, InstagramIcon, LinkedinIcon } from './BrandIcons'

function SecretHeart() {
  const { findSecret } = useUniverse()
  const [clicks, setClicks] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)

  const click = () => {
    const n = clicks + 1
    setClicks(n)
    if (n >= 5) {
      setClicks(0)
      setOpen(true)
      confettiFrom(ref.current)
      findSecret('heart', 'Secret unlocked: the heart remembers ♡', '💗')
    }
  }

  return (
    <>
      <motion.button
        ref={ref}
        onClick={click}
        aria-label={`A heart. It wants ${5 - clicks} more clicks.`}
        whileTap={{ scale: 1.4 }}
        animate={{ scale: 1 + clicks * 0.12 }}
        className="grid h-12 w-12 place-items-center rounded-full text-hot"
      >
        <Heart fill="currentColor" size={22 + clicks * 2} />
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[100] grid place-items-center bg-ink/60 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="secret-title"
              initial={{ scale: 0.8, rotate: -4 }}
              animate={{ scale: 1, rotate: -1 }}
              exit={{ scale: 0.8 }}
              onClick={(e) => e.stopPropagation()}
              className="sticker relative max-w-md bg-baby p-8 text-center"
            >
              <button autoFocus onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-full p-1 hover:bg-cream" aria-label="Close">
                <X size={18} />
              </button>
              <p className="text-5xl">💌</p>
              <h2 id="secret-title" className="mt-3 font-display text-3xl font-black">Secret message</h2>
              <p className="mt-3 text-lg">{about.secretMessage}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function PlotTwist() {
  const { findSecret } = useUniverse()
  const [i, setI] = useState(-1)
  return (
    <div className="relative">
      <button
        onClick={() => {
          const next = (i + 1) % about.funFacts.length
          setI(next)
          if (i === -1) findSecret('plot-twist', 'Secret unlocked: Plot Twist!', '🌀')
        }}
        className="rounded-full border border-dashed border-cream/25 px-3 py-1 text-xs text-cream/40 transition hover:border-hot hover:text-hot"
      >
        psst… plot twist?
      </button>
      <AnimatePresence mode="wait">
        {i >= 0 && (
          <motion.p
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 max-w-sm font-hand text-2xl leading-tight text-baby"
            aria-live="polite"
          >
            {about.funFacts[i]}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-ink text-cream">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-[1.4fr_1fr] md:px-8">
        <div>
          <p className="font-display text-5xl font-black leading-none md:text-7xl">
            {site.title}
            <span className="text-hot">♡</span>
          </p>
          <p className="mt-3 font-hand text-3xl text-baby">{site.tagline}</p>
          <div className="mt-6">
            <PlotTwist />
          </div>
        </div>
        <div className="flex flex-col items-start gap-4 md:items-end">
          <div className="flex gap-3">
            <a href={links.linkedin} target="_blank" rel="noreferrer" aria-label="LinkedIn" className="grid h-12 w-12 place-items-center rounded-full border-2 border-cream transition hover:bg-hot">
              <LinkedinIcon />
            </a>
            <a href={links.instagram} target="_blank" rel="noreferrer" aria-label="Instagram" className="grid h-12 w-12 place-items-center rounded-full border-2 border-cream transition hover:bg-hot">
              <InstagramIcon />
            </a>
            <a href={links.github} target="_blank" rel="noreferrer" aria-label="GitHub" className="grid h-12 w-12 place-items-center rounded-full border-2 border-cream transition hover:bg-hot">
              <GithubIcon />
            </a>
            <a href={`mailto:${links.email}`} aria-label="Email" className="grid h-12 w-12 place-items-center rounded-full border-2 border-cream transition hover:bg-hot">
              <Mail size={20} />
            </a>
          </div>
          <div className="flex items-center gap-2 text-sm text-cream/60">
            Made with pink, data and <SecretHeart />
          </div>
          <p className="text-xs text-cream/40">© {new Date().getFullYear()} {site.name}. Hosted for free on GitHub Pages.</p>
        </div>
      </div>
      <div aria-hidden className="pointer-events-none select-none whitespace-nowrap pb-2 font-display text-[18vw] font-black leading-[0.8] text-cream/[0.04]">
        DATA · DUMBBELLS · DREAMS
      </div>
    </footer>
  )
}
