import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useAnimationControls } from 'motion/react'
import { Check, Play, RotateCcw, Share2, Timer, Trophy } from 'lucide-react'
import { gym, site } from '../../data/content'
import { confetti } from '../../lib/confetti'

const DURATION = 10_000
const BEST_KEY = 'yiyis-universe:best-reps'

type Phase = 'idle' | 'running' | 'done'

function hype(reps: number, record: number) {
  if (reps === 0) return 'Grab the bar. Tap the dumbbell to start!'
  if (reps > record) return 'NEW PR!!! Somebody call the gym owner 🚨'
  if (reps >= record - 3) return "She's close… SHE'S CLOSE!"
  if (reps >= 30) return 'Progressive overload? More like progressive OVERJOY.'
  if (reps >= 20) return 'Your form is immaculate. Truly. ✨'
  if (reps >= 12) return "That's a warm-up set, right? RIGHT?"
  if (reps >= 6) return 'Light weight, baby! 💅'
  return 'Ooh, we are lifting!'
}

export function BeatMyReps() {
  const record = gym.myRepRecord
  const [phase, setPhase] = useState<Phase>('idle')
  const [reps, setReps] = useState(0)
  const [timeLeft, setTimeLeft] = useState(DURATION)
  const [best, setBest] = useState<number>(() => {
    try { return Number(localStorage.getItem(BEST_KEY) ?? 0) || 0 } catch { return 0 }
  })
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle')
  const [pops, setPops] = useState<number[]>([])
  const startRef = useRef(0)
  const repsRef = useRef(0)
  const controls = useAnimationControls()
  const btnRef = useRef<HTMLButtonElement>(null)

  const finish = useCallback(() => {
    setPhase('done')
    const final = repsRef.current
    setBest((b) => {
      const nb = Math.max(b, final)
      try { localStorage.setItem(BEST_KEY, String(nb)) } catch { /* ignore */ }
      return nb
    })
    if (final > record) {
      confetti({ y: 0.4, count: 220 })
      window.setTimeout(() => confetti({ x: 0.25, y: 0.5 }), 250)
      window.setTimeout(() => confetti({ x: 0.75, y: 0.5 }), 450)
    } else if (final >= record * 0.6) {
      confetti({ y: 0.45, count: 90 })
    }
  }, [record])

  useEffect(() => {
    if (phase !== 'running') return
    let raf = 0
    const tick = () => {
      const left = Math.max(0, DURATION - (performance.now() - startRef.current))
      setTimeLeft(left)
      if (left <= 0) finish()
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase, finish])

  const rep = () => {
    if (phase === 'done') return
    if (phase === 'idle') {
      startRef.current = performance.now()
      setPhase('running')
    }
    repsRef.current += 1
    setReps(repsRef.current)
    setPops((p) => [...p.slice(-6), repsRef.current])
    controls.start({ y: [0, -46, 0], rotate: [0, -4, 0], transition: { duration: 0.22 } })
  }

  const reset = () => {
    repsRef.current = 0
    setReps(0)
    setTimeLeft(DURATION)
    setPhase('idle')
    setPops([])
    setShareState('idle')
    btnRef.current?.focus()
  }

  const share = async () => {
    const beat = reps > record
    const text = beat
      ? `I just did ${reps} reps in 10 seconds and BEAT ${site.name}'s record of ${record}. 💪♡`
      : `I did ${reps} reps in 10 seconds on ${site.name}'s Universe. Her record is ${record}. Can you beat it? 💪♡`
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: `Beat ${site.name}'s Reps`, text, url })
        return
      }
      await navigator.clipboard.writeText(`${text} ${url}`)
      setShareState('copied')
    } catch {
      /* user cancelled share sheet */
    }
  }

  const progress = Math.min(1, reps / record)
  const beat = reps > record

  return (
    <div className="sticker overflow-hidden bg-hot text-cream">
      <div className="grid lg:grid-cols-[1fr_0.9fr]">
        <div className="relative flex flex-col items-center justify-center gap-4 border-b-2 border-ink p-6 lg:border-b-0 lg:border-r-2 md:p-10">
          <div className="dots absolute inset-0 opacity-20" aria-hidden />
          <p className="relative text-center font-hand text-3xl leading-tight" aria-live="polite">
            {phase === 'done' ? (beat ? 'You beat me. I am honoured and slightly offended.' : 'Time! Great set.') : hype(reps, record)}
          </p>

          <button
            ref={btnRef}
            type="button"
            onPointerDown={(e) => { e.preventDefault(); rep() }}
            onKeyDown={(e) => {
              if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); rep() }
            }}
            onClick={(e) => { if (e.detail === 0) rep() /* assistive-tech activation */ }}
            disabled={phase === 'done'}
            aria-label={`Do a rep. ${reps} reps so far.`}
            className="relative grid h-56 w-full max-w-sm touch-manipulation select-none place-items-center rounded-[2rem] border-2 border-dashed border-cream/50 transition hover:border-cream focus-visible:border-cream disabled:opacity-60"
          >
            <motion.svg animate={controls} viewBox="0 0 220 100" className="w-64 drop-shadow-[5px_5px_0_rgba(33,21,29,1)]" aria-hidden>
              <rect x="50" y="44" width="120" height="12" rx="6" fill="#21151D" />
              <rect x="22" y="14" width="30" height="72" rx="10" fill="#FFFDF8" stroke="#21151D" strokeWidth="4" />
              <rect x="168" y="14" width="30" height="72" rx="10" fill="#FFFDF8" stroke="#21151D" strokeWidth="4" />
              <rect x="4" y="26" width="20" height="48" rx="7" fill="#FFD6EA" stroke="#21151D" strokeWidth="4" />
              <rect x="196" y="26" width="20" height="48" rx="7" fill="#FFD6EA" stroke="#21151D" strokeWidth="4" />
              <text x="110" y="36" textAnchor="middle" fontSize="16" fontWeight="900" fill="#21151D">♡</text>
            </motion.svg>
            <AnimatePresence>
              {pops.map((p) => (
                <motion.span
                  key={p}
                  initial={{ opacity: 1, y: 0, x: (p % 5) * 14 - 28 }}
                  animate={{ opacity: 0, y: -90 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.7 }}
                  className="pointer-events-none absolute top-10 font-display text-2xl font-black"
                  aria-hidden
                >
                  +1
                </motion.span>
              ))}
            </AnimatePresence>
            <span className="absolute bottom-3 text-sm font-semibold opacity-80">
              {phase === 'idle' ? 'tap / click / press space' : phase === 'running' ? 'KEEP GOING' : 'set complete'}
            </span>
          </button>
        </div>

        <div className="space-y-5 bg-ink p-6 md:p-8">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-baby">Reps</p>
              <motion.p key={reps} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="font-display text-8xl font-black leading-none tabular-nums">
                {reps}
              </motion.p>
            </div>
            <div className="text-right">
              <p className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-baby"><Timer size={14} /> Time</p>
              <p className="font-display text-5xl font-black tabular-nums">{(timeLeft / 1000).toFixed(1)}s</p>
            </div>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-sm font-semibold">
              <span>Progress to my record</span>
              <span>{reps}/{record}</span>
            </div>
            <div
              className="h-6 overflow-hidden rounded-full border-2 border-cream bg-ink"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={record}
              aria-valuenow={Math.min(reps, record)}
              aria-label="Progress to Yiyi's rep record"
            >
              <motion.div className={`h-full ${beat ? 'bg-baby' : 'bg-hot'}`} animate={{ width: `${progress * 100}%` }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} />
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream/15" aria-hidden>
              <div className="h-full bg-cream/60" style={{ width: `${(timeLeft / DURATION) * 100}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl border-2 border-cream/20 p-3">
              <p className="text-baby">My record</p>
              <p className="font-display text-3xl font-black">{record}</p>
            </div>
            <div className="rounded-2xl border-2 border-cream/20 p-3">
              <p className="text-baby">Your best</p>
              <p className="font-display text-3xl font-black">{best}</p>
            </div>
          </div>

          <AnimatePresence>
            {phase === 'done' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-cream p-4 text-ink">
                <p className="flex items-center gap-2 font-display text-2xl font-black">
                  {beat ? <><Trophy className="text-hot" /> You beat my record!</> : <>{reps} reps in 10s 💪</>}
                </p>
                <p className="text-sm text-ink/70">
                  {beat ? 'Screenshot this. Frame it. Tell your friends.' : `Only ${record - reps + 1} more to beat me. Rest 60 seconds and go again.`}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={reset} className="btn-ink !py-2 text-sm"><RotateCcw size={16} /> Another set</button>
                  <button onClick={share} className="btn-hot !py-2 text-sm">
                    {shareState === 'copied' ? <><Check size={16} /> Copied!</> : <><Share2 size={16} /> Share result</>}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {phase === 'idle' && (
            <p className="flex items-center gap-2 text-sm text-cream/70">
              <Play size={14} /> The 10-second timer starts on your first rep.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
