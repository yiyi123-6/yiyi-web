import { motion, useReducedMotion, type Variants } from 'motion/react'
import { ArrowRight, ArrowUpRight, Dices } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { Avatar } from '../components/Avatar'
import { Marquee, Reveal } from '../components/Bits'
import { feelingLucky } from '../components/Nav'
import { links, photos, site } from '../data/content'
import { asset } from '../lib/asset'
import { href, type World } from '../lib/router'
import { BADGE_EMOJI, useUniverse } from '../lib/universe'

const HIGHLIGHT: Record<string, string> = {
  models: 'bg-baby',
  weights: 'bg-hot text-cream',
  mountains: 'bg-ink text-cream',
}

function Headline() {
  const words = site.headline.split(' ')
  return (
    <h1 className="font-display text-[clamp(2.6rem,7.2vw,6.4rem)] font-black leading-[0.92] tracking-[-0.03em]">
      {words.map((w, i) => {
        const key = w.toLowerCase().replace(/[^a-z]/g, '')
        const hl = HIGHLIGHT[key]
        return (
          <Fragment key={i}>
          <motion.span
            className="inline-block"
            initial={{ opacity: 0, y: 40, rotate: 4 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ delay: 0.05 * i, type: 'spring', stiffness: 220, damping: 20 }}
          >
            {hl ? (
              <span className={`relative mx-[0.04em] inline-block -rotate-1 rounded-2xl border-[3px] border-ink px-[0.18em] italic ${hl}`}>
                {w.replace(/[.,]/g, '')}
              </span>
            ) : (
              w.replace(/[.,]$/, '')
            )}
            {/[.,]$/.test(w) ? w.slice(-1) : ''}
          </motion.span>
          {i === 2 ? <br /> : ' '}
          </Fragment>
        )
      })}
    </h1>
  )
}

function SpinningBadge() {
  const text = 'DATA • DUMBBELLS • BIG DREAMS • '
  return (
    <div className="absolute -left-4 top-6 h-28 w-28 md:-left-10 md:h-36 md:w-36" aria-hidden>
      <svg viewBox="0 0 100 100" className="h-full w-full animate-spin-slow">
        <defs>
          <path id="circle" d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0" />
        </defs>
        <circle cx="50" cy="50" r="49" fill="#21151D" />
        <text fill="#FFFDF8" fontSize="10.5" fontWeight="700" letterSpacing="1.5">
          <textPath href="#circle">{text}</textPath>
        </text>
      </svg>
      <span className="absolute inset-0 grid place-items-center text-3xl text-hot">♡</span>
    </div>
  )
}

function FloatingSticker({ children, className, r = 0, delay = 0 }: { children: ReactNode; className: string; r?: number; delay?: number }) {
  return (
    <div
      aria-hidden
      className={`sticker absolute grid place-items-center animate-float ${className}`}
      style={{ ['--r' as string]: `${r}deg`, animationDelay: `${delay}s` }}
    >
      {children}
    </div>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="dots absolute inset-0 opacity-60" aria-hidden />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-8 md:px-8 lg:grid-cols-[1.25fr_0.75fr] lg:pt-14">
        <div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 flex flex-wrap items-center gap-3">
            <span className="chip bg-cream">Vol. 01 — The Universe Issue</span>
            <span className="chip">
              <span className="h-2 w-2 animate-pulse rounded-full bg-hot" /> {site.tagline}
            </span>
          </motion.div>
          <Headline />
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mt-6 max-w-xl text-lg text-ink/80 md:text-xl"
          >
            {site.intro}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75 }} className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => document.getElementById('portals')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="btn-ink"
            >
              Enter my universe <ArrowRight size={18} />
            </button>
            <button onClick={() => feelingLucky('home')} className="btn-hot">
              <Dices size={18} /> I'm Feeling Lucky ♡
            </button>
          </motion.div>
          <p className="mt-6 font-hand text-2xl text-berry">↳ psst, click my avatar. she talks.</p>
        </div>

        <div className="relative mx-auto w-full max-w-sm pt-10 lg:max-w-none">
          <div className="absolute inset-x-6 bottom-0 top-16 -rotate-3 rounded-[3rem] border-2 border-ink bg-hot" aria-hidden />
          <div className="absolute inset-x-6 bottom-0 top-16 rotate-2 rounded-[3rem] border-2 border-ink bg-baby" aria-hidden />
          <SpinningBadge />
          <FloatingSticker className="-right-2 top-14 h-16 w-16 text-3xl md:right-0" r={8}>📈</FloatingSticker>
          <FloatingSticker className="bottom-24 -right-3 h-14 w-14 bg-baby text-2xl" r={-10} delay={1.2}>🏔️</FloatingSticker>
          <FloatingSticker className="-left-2 top-40 h-14 w-14 bg-hot text-2xl" r={12} delay={0.6}>🚀</FloatingSticker>
          <Avatar className="relative mx-auto w-[85%] pb-4 pt-10" />
          <motion.a
            href={links.instagram}
            target="_blank"
            rel="noreferrer"
            aria-label={`The real ${site.name}, on Instagram`}
            initial={{ opacity: 0, rotate: -20, y: 30 }}
            animate={{ opacity: 1, rotate: -8, y: 0 }}
            whileHover={{ rotate: 0, scale: 1.05 }}
            transition={{ delay: 0.9, type: 'spring' }}
            className="absolute -bottom-6 -left-4 z-20 w-28 border-2 border-ink bg-cream p-1.5 pb-6 shadow-[var(--shadow-sticker)] md:-left-12 md:w-36"
          >
            <img src={asset(photos.hero.src)} alt={photos.hero.alt} className="aspect-[4/5] w-full object-cover" decoding="async" />
            <span className="absolute inset-x-0 bottom-0.5 text-center font-hand text-lg leading-tight">the real me ♡</span>
          </motion.a>
        </div>
      </div>
    </section>
  )
}

type PortalDef = {
  world: World
  title: string
  kicker: string
  blurb: string
  bg: string
  text: string
  rotate: string
  art: (v: Variants) => ReactNode
}

const PORTALS: PortalDef[] = [
  {
    world: 'brain',
    title: 'Explore My Brain',
    kicker: 'Data Science & Career',
    blurb: 'Ask my tiny AI what we should do together, peek at my projects, see how I think.',
    bg: 'bg-baby',
    text: 'text-ink',
    rotate: 'md:-rotate-1',
    art: (v) => (
      <svg viewBox="0 0 120 100" className="h-full w-full">
        {[
          [20, 30], [20, 70], [60, 20], [60, 50], [60, 80], [100, 50],
        ].map(([x, y], i) => (
          <motion.circle key={i} cx={x} cy={y} r="8" fill={i === 5 ? '#FF4FA3' : '#FFFDF8'} stroke="#21151D" strokeWidth="3" variants={v} custom={i} />
        ))}
        {[
          [20, 30, 60, 20], [20, 30, 60, 50], [20, 70, 60, 50], [20, 70, 60, 80], [60, 20, 100, 50], [60, 50, 100, 50], [60, 80, 100, 50],
        ].map(([a, b, c, d], i) => (
          <line key={i} x1={a} y1={b} x2={c} y2={d} stroke="#21151D" strokeWidth="2" opacity=".5" />
        ))}
      </svg>
    ),
  },
  {
    world: 'gym',
    title: 'Enter My Gym',
    kicker: 'Fitness & Strength',
    blurb: 'Beat my reps, browse my PR scrapbook, get unreasonably motivated.',
    bg: 'bg-hot',
    text: 'text-cream',
    rotate: 'md:rotate-1',
    art: (v) => (
      <motion.svg viewBox="0 0 120 100" className="h-full w-full" variants={v} custom={-1}>
        <rect x="30" y="46" width="60" height="8" rx="4" fill="#21151D" />
        <rect x="14" y="26" width="18" height="48" rx="6" fill="#FFFDF8" stroke="#21151D" strokeWidth="3" />
        <rect x="88" y="26" width="18" height="48" rx="6" fill="#FFFDF8" stroke="#21151D" strokeWidth="3" />
        <rect x="4" y="34" width="12" height="32" rx="4" fill="#FFD6EA" stroke="#21151D" strokeWidth="3" />
        <rect x="104" y="34" width="12" height="32" rx="4" fill="#FFD6EA" stroke="#21151D" strokeWidth="3" />
      </motion.svg>
    ),
  },
  {
    world: 'mountains',
    title: 'Chase Mountains',
    kicker: 'Hiking & Adventures',
    blurb: 'A pink adventure journal, a summit quest map and my dream list.',
    bg: 'bg-ink',
    text: 'text-cream',
    rotate: 'md:rotate-[0.6deg]',
    art: (v) => (
      <svg viewBox="0 0 120 100" className="h-full w-full overflow-visible">
        <motion.circle cx="92" cy="26" r="10" fill="#FFD6EA" variants={v} custom={-2} />
        <motion.path d="M0 100 L40 34 L62 66 L84 40 L120 100 Z" fill="#FF4FA3" stroke="#FFFDF8" strokeWidth="3" variants={v} custom={-3} style={{ originY: '100%' }} />
        <path d="M30 51 L40 34 L50 51 L44 47 L38 53 Z" fill="#FFFDF8" />
      </svg>
    ),
  },
  {
    world: 'founder',
    title: 'Meet the Founder',
    kicker: 'LunchMe & Entrepreneurship',
    blurb: 'The scrapbook of my founder era: ideas, pivots and lessons.',
    bg: 'bg-cream',
    text: 'text-ink',
    rotate: 'md:-rotate-[0.8deg]',
    art: (v) => (
      <motion.svg viewBox="0 0 120 100" className="h-full w-full overflow-visible" variants={v} custom={-4}>
        <path d="M60 8 C78 22 82 48 74 70 H46 C38 48 42 22 60 8 Z" fill="#FF4FA3" stroke="#21151D" strokeWidth="3" />
        <circle cx="60" cy="38" r="8" fill="#FFFDF8" stroke="#21151D" strokeWidth="3" />
        <path d="M46 58 L32 74 L46 72 Z M74 58 L88 74 L74 72 Z" fill="#8B1E55" stroke="#21151D" strokeWidth="3" />
        <path d="M52 72 Q60 96 68 72 Z" fill="#FFD6EA" stroke="#21151D" strokeWidth="3" />
      </motion.svg>
    ),
  },
]

function Portal({ p, index }: { p: PortalDef; index: number }) {
  const reduce = useReducedMotion()
  const { visited } = useUniverse()
  const got = visited.includes(p.world)
  const art: Variants = {
    rest: { y: 0, scale: 1, rotate: 0 },
    hover: (i: number) =>
      reduce
        ? {}
        : i >= 0
          ? { scale: [1, 1.5, 1], transition: { repeat: Infinity, duration: 0.9, delay: i * 0.12 } }
          : i === -1
            ? { y: [0, -18, 0], rotate: [0, -6, 0], transition: { repeat: Infinity, duration: 0.7 } }
            : i === -2
              ? { y: -14, transition: { type: 'spring' } }
              : i === -3
                ? { scaleY: 1.15, transition: { type: 'spring' } }
                : { y: -26, rotate: 6, transition: { repeat: Infinity, repeatType: 'reverse', duration: 0.45 } },
  }

  return (
    <Reveal delay={index * 0.08} className={index % 2 === 1 ? 'md:mt-16' : ''}>
      <motion.a
        href={href(p.world)}
        initial="rest"
        animate="rest"
        whileHover="hover"
        whileFocus="hover"
        whileTap={{ scale: 0.98 }}
        className={`group relative flex min-h-[22rem] flex-col justify-between overflow-hidden rounded-[2rem] border-2 border-ink p-6 shadow-[var(--shadow-sticker-lg)] transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[10px_10px_0_0_#21151D] md:p-8 ${p.bg} ${p.text} ${p.rotate}`}
      >
        <div className="flex items-start justify-between">
          <span className="font-display text-7xl font-black leading-none opacity-20">0{index + 1}</span>
          <span className={`chip ${got ? 'bg-cream text-ink' : 'bg-transparent text-current border-current'}`}>
            {got ? `${BADGE_EMOJI[p.world]} badge collected` : 'portal open'}
          </span>
        </div>
        <div className="pointer-events-none absolute right-4 top-16 h-32 w-40 md:h-40 md:w-48" aria-hidden>
          {p.art(art)}
        </div>
        <div className="relative">
          <p className="font-hand text-2xl opacity-80">{p.kicker}</p>
          <h3 className="font-display text-4xl font-black leading-none tracking-tight md:text-5xl">
            <span aria-hidden>{BADGE_EMOJI[p.world]} </span>
            {p.title}
          </h3>
          <p className="mt-3 max-w-xs opacity-80">{p.blurb}</p>
          <span className="mt-5 inline-flex items-center gap-2 font-semibold underline decoration-2 underline-offset-4">
            Step inside <ArrowUpRight size={18} className="transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" />
          </span>
        </div>
      </motion.a>
    </Reveal>
  )
}

function Portals() {
  return (
    <section id="portals" className="scroll-mt-20 mx-auto max-w-7xl px-4 py-20 md:px-8">
      <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">choose your adventure</p>
          <h2 className="font-display text-5xl font-black leading-[0.9] tracking-tight md:text-7xl">
            Four worlds.
            <br />
            <span className="text-outline">One</span> <span className="italic text-hot">me.</span>
          </h2>
        </div>
        <p className="max-w-sm text-ink/70">
          Each portal leads to a different side of me. Visit all four to collect your explorer badges (they live in the bottom-left corner).
        </p>
      </div>
      <div className="grid gap-8 md:grid-cols-2">
        {PORTALS.map((p, i) => (
          <Portal key={p.world} p={p} index={i} />
        ))}
      </div>
    </section>
  )
}

function Teasers() {
  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-24 md:grid-cols-[1fr_1.2fr] md:px-8">
      <Reveal>
        <a href={href('about')} className="sticker group block h-full -rotate-1 bg-blush p-8 transition hover:rotate-0">
          <p className="eyebrow">beyond the job title</p>
          <p className="font-display text-4xl font-black leading-none">Read my character card 🎮</p>
          <p className="mt-3 text-ink/70">Special abilities, side quests and things you won't find on my résumé.</p>
          <span className="mt-6 inline-flex items-center gap-2 font-semibold">
            Level up <ArrowRight size={16} className="transition group-hover:translate-x-1" />
          </span>
        </a>
      </Reveal>
      <Reveal delay={0.1}>
        <a href={href('connect')} className="group block h-full rotate-1 rounded-2xl border-2 border-ink bg-berry p-8 text-cream shadow-[var(--shadow-sticker-hot)] transition hover:rotate-0">
          <p className="font-hand text-2xl text-baby">no boring contact forms</p>
          <p className="font-display text-4xl font-black leading-none md:text-5xl">What's our next adventure? 💌</p>
          <p className="mt-3 text-cream/75">{site.currently}</p>
          <span className="mt-6 inline-flex items-center gap-2 font-semibold">
            Pick one <ArrowRight size={16} className="transition group-hover:translate-x-1" />
          </span>
        </a>
      </Reveal>
    </section>
  )
}

export function Home() {
  return (
    <>
      <Hero />
      <Marquee
        className="bg-ink text-cream"
        items={['Senior Data Scientist', 'Former founder of LunchMe', 'PR collector', 'Mountain chaser', 'Professional curious person']}
      />
      <Portals />
      <Teasers />
    </>
  )
}
