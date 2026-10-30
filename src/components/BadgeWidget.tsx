import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Lock, RotateCcw, X } from 'lucide-react'
import { WORLDS, href } from '../lib/router'
import { BADGE_EMOJI, BADGE_LABEL, TOTAL_SECRETS, useUniverse } from '../lib/universe'

const HINTS = [
  'A heart that likes being clicked… a lot.',
  'Some dumbbells want to follow you.',
  'Mountains grow when you pay attention to them.',
  'Type a word that makes everything sparkle (d…).',
  'Every good story has a plot twist (check the footer).',
]

/** Floating badge tracker: four world badges + secret counter. */
export function BadgeWidget() {
  const { visited, secretsFound, resetBadges } = useUniverse()
  const [open, setOpen] = useState(false)
  const count = visited.length

  return (
    <div className="fixed bottom-4 left-4 z-[80] print:hidden">
      <AnimatePresence>
        {open && (
          <motion.div
            id="badge-panel"
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            className="sticker mb-3 w-72 bg-cream p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-lg font-bold">Explorer badges</p>
              <button onClick={() => setOpen(false)} aria-label="Close badges" className="rounded-full p-1 hover:bg-baby">
                <X size={18} />
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {WORLDS.map((w) => {
                const got = visited.includes(w)
                return (
                  <li key={w}>
                    <a
                      href={href(w)}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2 rounded-xl border-2 px-2 py-2 text-sm font-semibold transition ${
                        got ? 'border-ink bg-baby' : 'border-dashed border-ink/30 text-ink/50 hover:border-ink/60'
                      }`}
                    >
                      <span className={`text-xl ${got ? '' : 'grayscale opacity-50'}`}>{BADGE_EMOJI[w]}</span>
                      {got ? BADGE_LABEL[w] : <span className="inline-flex items-center gap-1"><Lock size={12} /> ???</span>}
                    </a>
                  </li>
                )
              })}
            </ul>
            <div className="mt-4 border-t-2 border-dashed border-ink/20 pt-3">
              <p className="text-sm font-semibold">
                Secrets found: {secretsFound.length}/{TOTAL_SECRETS} 🤫
              </p>
              {secretsFound.length < TOTAL_SECRETS && (
                <p className="mt-1 font-hand text-lg leading-tight text-berry">
                  hint: {HINTS[secretsFound.length % HINTS.length]}
                </p>
              )}
            </div>
            {count > 0 && (
              <button onClick={resetBadges} className="mt-3 inline-flex items-center gap-1 text-xs text-ink/60 underline-offset-2 hover:underline">
                <RotateCcw size={12} /> reset badges
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="badge-panel"
        aria-label={`Explorer badges: ${count} of 4 collected`}
        className="sticker flex items-center gap-2 bg-ink px-3 py-2 text-cream transition hover:-translate-y-0.5"
      >
        <span className="flex -space-x-1">
          {WORLDS.map((w) => (
            <span
              key={w}
              className={`grid h-7 w-7 place-items-center rounded-full border-2 border-cream text-sm ${
                visited.includes(w) ? 'bg-hot' : 'bg-ink/80 grayscale opacity-60'
              }`}
            >
              {BADGE_EMOJI[w]}
            </span>
          ))}
        </span>
        <span className="pr-1 text-sm font-bold">{count}/4</span>
      </button>
    </div>
  )
}

export function Toasts() {
  const { toasts } = useUniverse()
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[95] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="sticker pointer-events-auto flex max-w-md items-center gap-3 bg-hot px-4 py-3 font-semibold text-cream"
          >
            {t.emoji && <span className="text-2xl">{t.emoji}</span>}
            <span>{t.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
