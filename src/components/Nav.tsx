import { useCallback, useEffect, useRef, useState, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useAnimate, useReducedMotion } from 'motion/react'
import { ArrowUpRight, Check, X } from 'lucide-react'
import { WORLDS, href, navigate, type Route, type World } from '../lib/router'
import { useUniverse } from '../lib/universe'
import { site } from '../data/content'

type Item = { route: Route; label: string; emoji: string; tone: string; tape: string; tilt: number }

const ITEMS: Item[] = [
  { route: 'brain', label: 'Brain', emoji: '🧠', tone: 'bg-baby text-ink', tape: 'bg-cream/85', tilt: -4 },
  { route: 'gym', label: 'Gym', emoji: '💪', tone: 'bg-hot text-cream', tape: 'bg-baby/90', tilt: 3 },
  { route: 'mountains', label: 'Mountains', emoji: '🏔️', tone: 'bg-ink text-cream', tape: 'bg-baby/90', tilt: -2 },
  { route: 'founder', label: 'Founder', emoji: '🚀', tone: 'bg-cream text-ink', tape: 'bg-hot/70', tilt: 4 },
  { route: 'about', label: 'About', emoji: '🎮', tone: 'bg-blush text-ink', tape: 'bg-hot/60', tilt: -3 },
  { route: 'connect', label: 'Say hi', emoji: '💌', tone: 'bg-berry text-cream', tape: 'bg-baby/90', tilt: 2 },
]

const isWorld = (r: Route): r is World => (WORLDS as readonly string[]).includes(r)

export function feelingLucky(current: Route) {
  const pool = WORLDS.filter((w) => w !== current)
  navigate(pool[Math.floor(Math.random() * pool.length)])
}

/** Visible while scrolling up, tucked away while scrolling down; becomes a floating dock once off the top. */
function useScrollDock(locked: boolean) {
  const [docked, setDocked] = useState(false)
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      setDocked(y > 24)
      if (y < 120 || y < last - 6) setHidden(false)
      else if (y > last + 6) setHidden(true)
      if (Math.abs(y - last) > 6) last = y
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return { docked, hidden: hidden && !locked, reveal: () => setHidden(false) }
}

const BURST = (() => {
  const pts: string[] = []
  for (let i = 0; i < 24; i++) {
    const r = i % 2 ? 40 : 48
    const a = (Math.PI * i) / 12
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`)
  }
  return pts.join(' ')
})()

function Planet() {
  return (
    <motion.svg
      viewBox="0 0 32 24"
      className="h-5 w-7 overflow-visible"
      animate={{ y: [0, -3, 0], rotate: [-8, 8, -8] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <ellipse cx="16" cy="13" rx="15" ry="4.5" fill="none" stroke="#21151d" strokeWidth="2" transform="rotate(-14 16 13)" />
      <circle cx="16" cy="12" r="8" fill="#ff4fa3" stroke="#21151d" strokeWidth="2" />
      <path d="M3.5 15.8 C 8 19, 24 15, 28.6 9.4" fill="none" stroke="#21151d" strokeWidth="2" transform="rotate(-2 16 13)" />
      <circle cx="13" cy="9.5" r="1.6" fill="#fffdf8" />
    </motion.svg>
  )
}

function YouAreHere({ className = '-top-6 left-1/2 -ml-3.5' }: { className?: string }) {
  return (
    <motion.span
      layoutId="nav-planet"
      aria-hidden
      className={`pointer-events-none absolute z-10 ${className}`}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
    >
      <Planet />
    </motion.span>
  )
}

function Logo({ route, compact }: { route: Route; compact: boolean }) {
  return (
    <a
      href={href('home')}
      aria-current={route === 'home' ? 'page' : undefined}
      aria-label={`${site.title} — home`}
      className="group relative flex shrink-0 items-center gap-2 rounded-full"
    >
      <span className={`relative grid place-items-center transition-[width,height] ${compact ? 'h-10 w-10' : 'h-12 w-12 md:h-14 md:w-14'}`}>
        <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 h-full w-full animate-spin-slow overflow-visible drop-shadow-[2px_2px_0_#21151d]">
          <polygon points={BURST} fill="#ffd6ea" stroke="#21151d" strokeWidth="4" strokeLinejoin="round" />
        </svg>
        <motion.span
          aria-hidden
          className="relative grid h-[58%] w-[58%] place-items-center rounded-full border-2 border-ink bg-hot font-display text-lg leading-none text-cream"
          whileHover={{ scale: [1, 1.25, 1, 1.18, 1], transition: { duration: 0.6 } }}
        >
          ♡
        </motion.span>
        {route === 'home' && <YouAreHere className="-right-4 -top-1" />}
      </span>
      <span
        aria-hidden
        className={`font-display text-lg font-black leading-none tracking-tight md:text-2xl ${compact ? 'hidden' : 'lg:hidden xl:inline'}`}
      >
        <span className="inline-block transition-transform group-hover:-rotate-3">{site.title}</span>
        <span className="ml-1 inline-block text-hot transition-transform group-hover:scale-125">♡</span>
      </span>
    </a>
  )
}

function Scribble({ ink }: { ink: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 50"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute -left-3 -top-2.5 h-[calc(100%+20px)] w-[calc(100%+24px)] overflow-visible ${ink ? 'text-ink' : 'text-hot'}`}
    >
      <motion.path
        d="M14 30 C 8 12, 58 3, 102 9 C 124 13, 120 40, 82 45 C 42 50, 2 44, 7 25 C 10 14, 32 7, 54 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
      />
    </svg>
  )
}

function Stamp({ tone = 'bg-cream text-hot' }: { tone?: string }) {
  return (
    <span aria-hidden className={`absolute -bottom-2 -right-2 grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-ink ${tone}`}>
      <Check size={10} strokeWidth={4} />
    </span>
  )
}

function WorldTag({ item, route, visited }: { item: Item; route: Route; visited: boolean }) {
  const active = route === item.route
  return (
    <motion.a
      href={href(item.route)}
      aria-current={active ? 'page' : undefined}
      className={`relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border-2 border-ink px-3 py-1.5 text-sm font-bold ${item.tone} ${
        active ? '' : 'shadow-[3px_3px_0_0_#21151d]'
      }`}
      initial={false}
      animate={{ rotate: active ? 0 : item.tilt, x: active ? 2 : 0, y: active ? 2 : 0 }}
      whileHover={active ? undefined : { rotate: [item.tilt, -item.tilt * 1.5, item.tilt, 0], y: -4, scale: 1.07, transition: { duration: 0.45 } }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 420, damping: 20 }}
    >
      <span aria-hidden className={`absolute -top-2 left-1/2 h-3 w-8 -translate-x-1/2 -rotate-6 border border-ink/15 ${item.tape}`} />
      <span aria-hidden>{item.emoji}</span>
      {item.label}
      {visited && (
        <>
          <Stamp tone={item.route === 'founder' ? 'bg-hot text-cream' : undefined} />
          <span className="sr-only"> (visited)</span>
        </>
      )}
      {active && <Scribble key={item.route} ink={item.tone.startsWith('bg-hot')} />}
      {active && <YouAreHere />}
    </motion.a>
  )
}

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

function DiceFace({ n }: { n: number }) {
  return (
    <span className="grid h-full w-full grid-cols-3 grid-rows-3 p-[18%]">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="grid place-items-center">
          {PIPS[n].includes(i) && <span className="h-[5px] w-[5px] rounded-full bg-current" />}
        </span>
      ))}
    </span>
  )
}

function LuckyDice({ route, label, big = false }: { route: Route; label?: string; big?: boolean }) {
  const reduce = useReducedMotion()
  const [scope, animate] = useAnimate<HTMLSpanElement>()
  const [face, setFace] = useState(5)
  const rolling = useRef(false)

  async function roll() {
    if (rolling.current) return
    if (reduce) return feelingLucky(route)
    rolling.current = true
    const shuffle = window.setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 70)
    await animate(scope.current, { rotate: [0, 260, 520, 720], y: [0, -16, -6, 0], scale: [1, 1.18, 1.05, 1] }, { duration: 0.75, ease: 'easeOut' })
    window.clearInterval(shuffle)
    animate(scope.current, { rotate: 0 }, { duration: 0 })
    rolling.current = false
    feelingLucky(route)
  }

  return (
    <button
      type="button"
      onClick={roll}
      aria-label="I'm Feeling Lucky — roll the dice to visit a random world"
      title="I'm Feeling Lucky ♡"
      className={`group inline-flex shrink-0 items-center gap-2 rounded-xl ${big ? 'btn-cream w-full !py-3 text-lg' : ''}`}
    >
      {label && !big && <span className="hidden font-hand text-xl leading-none text-berry xl:inline">{label}</span>}
      <span
        ref={scope}
        aria-hidden
        className={`grid shrink-0 place-items-center rounded-[10px] border-2 border-ink bg-hot text-cream shadow-[3px_3px_0_0_#21151d] transition-shadow group-hover:shadow-[4px_4px_0_0_#21151d] group-active:shadow-none ${
          big ? 'h-9 w-9' : 'h-10 w-10 group-hover:animate-wiggle'
        }`}
      >
        <DiceFace n={face} />
      </span>
      {big && <span>{label}</span>}
    </button>
  )
}

function Annotation({ count }: { count: number }) {
  const text = count === 0 ? 'pick a world →' : count === WORLDS.length ? 'all stamped ♡ →' : `${count}/${WORLDS.length} stamped →`
  return (
    <span aria-hidden className="hidden -rotate-6 whitespace-nowrap font-hand text-xl leading-none text-berry xl:inline">
      {text}
    </span>
  )
}

function MenuToggle({ open, onClick, btnRef }: { open: boolean; onClick: () => void; btnRef: Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={btnRef}
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls="worlds-menu"
      aria-label={open ? 'Close menu' : 'Open menu'}
      className="group relative inline-flex h-10 items-center gap-2 rounded-xl border-2 border-ink bg-cream px-2.5 shadow-[3px_3px_0_0_#21151d] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none lg:hidden"
    >
      <span aria-hidden className="grid grid-cols-2 gap-[3px] transition-transform duration-300 group-hover:rotate-45">
        <span className="h-2 w-2 rounded-full border border-ink bg-baby" />
        <span className="h-2 w-2 rounded-full border border-ink bg-hot" />
        <span className="h-2 w-2 rounded-full border border-ink bg-ink" />
        <span className="h-2 w-2 rounded-full border border-ink bg-berry" />
      </span>
      <span aria-hidden className="font-hand text-xl leading-none">worlds</span>
    </button>
  )
}

function MobileMenu({ route, visited, onClose }: { route: Route; visited: World[]; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector<HTMLElement>('a')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab' || !panel.current) return
      const focusables = panel.current.querySelectorAll<HTMLElement>('a, button')
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <motion.div
      id="worlds-menu"
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label="Pick a world"
      className="dots fixed inset-0 z-[85] overflow-y-auto bg-hot lg:hidden"
      initial={{ clipPath: 'circle(0% at calc(100% - 3rem) 2.5rem)' }}
      animate={{ clipPath: 'circle(150% at calc(100% - 3rem) 2.5rem)' }}
      exit={{ clipPath: 'circle(0% at calc(100% - 3rem) 2.5rem)' }}
      transition={{ duration: 0.45, ease: [0.65, 0, 0.35, 1] }}
    >
      <div className="mx-auto flex min-h-full max-w-md flex-col px-5 pb-8 pt-4">
        <div className="flex items-center justify-between">
          <p className="-rotate-3 font-hand text-3xl leading-none text-cream">
            pick a world <span className="text-ink">✦</span> {visited.length}/{WORLDS.length} stamped
          </p>
          <button type="button" onClick={onClose} aria-label="Close menu" className="btn-cream !h-11 !w-11 !p-0">
            <X size={22} />
          </button>
        </div>

        <ul className="mt-8 flex flex-col gap-4">
          {ITEMS.map((item, i) => {
            const active = route === item.route
            const got = isWorld(item.route) && visited.includes(item.route)
            return (
              <motion.li
                key={item.route}
                initial={{ opacity: 0, y: 40, rotate: item.tilt * 2 }}
                animate={{ opacity: 1, y: 0, rotate: item.tilt / 2 }}
                transition={{ delay: 0.12 + i * 0.05, type: 'spring', stiffness: 320, damping: 22 }}
              >
                <a
                  href={href(item.route)}
                  onClick={onClose}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center justify-between gap-3 rounded-2xl border-2 border-ink px-5 py-3.5 shadow-[var(--shadow-sticker-lg)] transition active:translate-x-1 active:translate-y-1 active:shadow-none ${item.tone}`}
                >
                  <span aria-hidden className={`absolute -top-2.5 left-8 h-4 w-12 -rotate-6 border border-ink/15 ${item.tape}`} />
                  {active && (
                    <span aria-hidden className="absolute -top-3.5 right-5 rotate-3 rounded-full border-2 border-ink bg-ink px-2.5 py-0.5 font-hand text-lg leading-none whitespace-nowrap text-cream">
                      you are here ♡
                    </span>
                  )}
                  <span className="flex items-center gap-3 font-display text-3xl font-black leading-none tracking-tight">
                    <span aria-hidden className="text-3xl">{item.emoji}</span>
                    {item.label}
                  </span>
                  <span className="flex items-center gap-2">
                    {got && (
                      <span className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-cream px-2 py-0.5 text-xs font-bold text-hot">
                        <Check size={12} strokeWidth={4} /> stamped
                      </span>
                    )}
                    {!active && !got && <ArrowUpRight aria-hidden size={24} />}
                  </span>
                </a>
              </motion.li>
            )
          })}
        </ul>

        <motion.div
          className="mt-auto pt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <LuckyDice route={route} label="I'm Feeling Lucky ♡" big />
        </motion.div>
      </div>
    </motion.div>
  )
}

export function Nav({ route }: { route: Route }) {
  const { visited } = useUniverse()
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const { docked, hidden, reveal } = useScrollDock(open)

  useEffect(() => setOpen(false), [route])
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => mq.matches && setOpen(false)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    toggleRef.current?.focus()
  }, [])

  return (
    <header className="pointer-events-none sticky top-0 z-[70] h-[76px] lg:h-[88px] print:hidden">
      <motion.div
        className="flex h-full items-center px-3 md:px-6"
        initial={false}
        animate={{ y: hidden ? '-120%' : '0%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        onFocusCapture={reveal}
      >
        <nav
          aria-label="Main"
          className={`pointer-events-auto mx-auto flex items-center justify-between gap-3 transition-[padding,background-color,border-color,box-shadow,border-radius] duration-300 lg:gap-5 ${
            docked
              ? 'w-full rounded-[20px] border-2 border-ink bg-cream py-1.5 pl-2 pr-3 shadow-[var(--shadow-sticker)] lg:w-fit lg:pl-3'
              : 'w-full max-w-7xl border-2 border-transparent py-1.5 md:px-2'
          }`}
        >
          <Logo route={route} compact={docked} />

          <div className="hidden items-center gap-4 lg:flex">
            {!docked && <Annotation count={visited.length} />}
            <ul className="flex items-center gap-2.5 pt-1">
              {ITEMS.map((item, i) => (
                <li key={item.route} className="flex items-center gap-2.5">
                  {i === WORLDS.length && (
                    <span aria-hidden className="font-hand text-2xl leading-none text-hot">
                      ✦
                    </span>
                  )}
                  <WorldTag item={item} route={route} visited={isWorld(item.route) && visited.includes(item.route)} />
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-2.5">
            <LuckyDice route={route} label={docked ? undefined : 'feeling lucky?'} />
            <MenuToggle open={open} onClick={() => setOpen((o) => !o)} btnRef={toggleRef} />
          </div>
        </nav>
      </motion.div>

      {createPortal(
        <AnimatePresence>{open && <MobileMenu route={route} visited={visited} onClose={close} />}</AnimatePresence>,
        document.body,
      )}
    </header>
  )
}
