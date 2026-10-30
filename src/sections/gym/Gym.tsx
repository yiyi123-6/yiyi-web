import { useState } from 'react'
import { motion } from 'motion/react'
import { Flame, Lock } from 'lucide-react'
import { BackHome, Marquee, Reveal, SectionTitle } from '../../components/Bits'
import { Photo } from '../../components/Photo'
import { gym, links } from '../../data/content'
import { useUniverse } from '../../lib/universe'
import { BeatMyReps } from './BeatMyReps'

function SecretDumbbell() {
  const { summonDumbbell, findSecret } = useUniverse()
  return (
    <button
      onClick={() => {
        summonDumbbell()
        findSecret('dumbbell', 'A wild dumbbell is following you! 🏋️‍♀️', '🩷')
      }}
      className="sticker group absolute right-3 top-6 -rotate-12 bg-baby px-2 py-1.5 text-xs font-bold text-ink transition hover:rotate-0 md:right-8 md:top-24 md:px-3 md:py-2 md:text-sm"
    >
      <span className="block text-3xl transition group-hover:animate-wiggle" aria-hidden>🏋️‍♀️</span>
      don't click me
    </button>
  )
}

function GymHero() {
  return (
    <section className="relative overflow-hidden border-b-2 border-ink bg-ink text-cream">
      <div className="absolute inset-0 opacity-[0.07]" aria-hidden style={{ backgroundImage: 'repeating-linear-gradient(45deg,#FF4FA3 0 2px,transparent 2px 22px)' }} />
      <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-8 md:px-8">
        <BackHome className="!bg-cream !text-ink" />
        <SecretDumbbell />
        <p className="mt-10 font-hand text-2xl text-baby">world 02 · the gym</p>
        <h1 className="font-display text-[clamp(3rem,10vw,9rem)] font-black uppercase leading-[0.82] tracking-[-0.04em]">
          Stronger
          <br />
          <span className="text-hot">every</span> <span className="italic">day</span>
        </h1>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {gym.quotes.map((q, i) => (
            <motion.blockquote
              key={q}
              initial={{ opacity: 0, x: i ? 30 : -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.15 }}
              className={`rounded-2xl border-2 border-cream p-5 font-display text-2xl font-bold italic md:text-3xl ${i ? 'rotate-1 bg-hot' : '-rotate-1 bg-cream text-ink'}`}
            >
              “{q}”
            </motion.blockquote>
          ))}
        </div>
      </div>
    </section>
  )
}

function ProgressChart() {
  const { points, label, unit } = gym.progress
  const [active, setActive] = useState<number | null>(points.length - 1)
  const W = 600, H = 260, P = 36
  const vals = points.map((p) => p.value)
  const min = Math.min(...vals) * 0.9
  const max = Math.max(...vals) * 1.05
  const xs = (i: number) => P + (i * (W - P * 2)) / Math.max(1, points.length - 1)
  const ys = (v: number) => H - P - ((v - min) / (max - min || 1)) * (H - P * 2)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${xs(i)},${ys(p.value)}`).join(' ')
  const area = `${d} L${xs(points.length - 1)},${H - P} L${xs(0)},${H - P} Z`

  return (
    <div className="sticker bg-cream p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-2xl font-black">Progressive overload, visualised</p>
        <p className="text-sm text-ink/60">{label}</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={`${label}: ${points.map((p) => `${p.label} ${p.value}${unit}`).join(', ')}`}>
        <defs>
          <linearGradient id="g-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#FF4FA3" stopOpacity=".45" />
            <stop offset="1" stopColor="#FF4FA3" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1={P} x2={W - P} y1={P + (i * (H - P * 2)) / 3} y2={P + (i * (H - P * 2)) / 3} stroke="#21151D" strokeOpacity=".08" strokeWidth="2" />
        ))}
        <motion.path d={area} fill="url(#g-area)" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.6 }} />
        <motion.path
          d={d}
          fill="none"
          stroke="#21151D"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease: 'easeInOut' }}
        />
        {points.map((p, i) => (
          <g
            key={p.label}
            tabIndex={0}
            role="button"
            aria-label={`${p.label}: ${p.value} ${unit}`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            className="cursor-pointer outline-none"
          >
            <circle cx={xs(i)} cy={ys(p.value)} r="18" fill="transparent" />
            <circle cx={xs(i)} cy={ys(p.value)} r={active === i ? 10 : 7} fill={active === i ? '#FF4FA3' : '#FFFDF8'} stroke="#21151D" strokeWidth="3" />
            <text x={xs(i)} y={H - 10} textAnchor="middle" fontSize="14" fontWeight="700" fill="#21151D" opacity=".6">{p.label}</text>
          </g>
        ))}
        {active !== null && (
          <g transform={`translate(${Math.min(W - 80, Math.max(80, xs(active)))} ${ys(points[active].value) - 30})`} pointerEvents="none">
            <rect x="-48" y="-24" width="96" height="32" rx="16" fill="#21151D" />
            <text y="-3" textAnchor="middle" fontSize="15" fontWeight="800" fill="#FFFDF8">{points[active].value} {unit}</text>
          </g>
        )}
      </svg>
    </div>
  )
}

function Scrapbook() {
  const streak = gym.week.filter((d) => d.done).length
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
      <SectionTitle eyebrow="the fitness scrapbook" title={<>Receipts, <span className="italic text-hot">not</span> excuses.</>}>
        My PRs, progress and milestones. The numbers live in one editable file; empty means “coming soon, watch this space”.
      </SectionTitle>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Reveal>
          <div className="sticker h-full -rotate-1 bg-baby p-6">
            <p className="font-display text-2xl font-black">PR wall 🏆</p>
            <ul className="mt-4 space-y-3">
              {gym.prs.map((pr) => (
                <li key={pr.lift} className="flex items-center justify-between gap-3 rounded-xl border-2 border-ink bg-cream px-4 py-3">
                  <span className="font-semibold">{pr.lift}</span>
                  {pr.value ? (
                    <span className="font-display text-2xl font-black text-hot">
                      {pr.value}<span className="ml-1 text-sm text-ink/60">{pr.unit}</span>
                    </span>
                  ) : (
                    <span className="font-hand text-xl text-berry">to be announced ✎</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <ProgressChart />
        </Reveal>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Reveal>
          <div className="sticker bg-cream p-6">
            <div className="flex items-center justify-between">
              <p className="font-display text-2xl font-black">This week's log</p>
              <span className="chip bg-hot text-cream"><Flame size={14} /> {streak}/7 sessions</span>
            </div>
            <ul className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
              {gym.week.map((d, i) => (
                <motion.li
                  key={d.day}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className={`flex aspect-[3/4] flex-col justify-between rounded-xl border-2 border-ink p-2 ${d.done ? 'bg-hot text-cream' : 'bg-blush'}`}
                >
                  <span className="text-xs font-bold uppercase">{d.day}</span>
                  <span className="text-xl" aria-hidden>{d.done ? '✓' : '·'}</span>
                  <span className="text-[11px] font-semibold leading-tight">{d.workout}</span>
                </motion.li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink/50">Sample week. Edit <code>gym.week</code> in <code>src/data/content.ts</code>.</p>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="sticker h-full bg-ink p-6 text-cream">
            <p className="font-display text-2xl font-black">Milestone badges</p>
            <ul className="mt-4 grid grid-cols-3 gap-3">
              {gym.milestones.map((m, i) => (
                <motion.li
                  key={i}
                  whileHover={{ rotate: i % 2 ? 6 : -6, scale: 1.05 }}
                  className={`flex aspect-square flex-col items-center justify-center rounded-full border-2 p-2 text-center ${
                    m.unlocked ? 'border-cream bg-hot' : 'border-dashed border-cream/30'
                  }`}
                >
                  <span className={`text-2xl ${m.unlocked ? '' : 'opacity-40 grayscale'}`} aria-hidden>{m.emoji}</span>
                  <span className="mt-1 text-[10px] font-bold leading-tight">
                    {m.title.replace(/^\[|\]$/g, '')}
                  </span>
                  {!m.unlocked && <Lock size={10} className="mt-1 opacity-50" aria-label="locked" />}
                </motion.li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

export function Gym() {
  return (
    <>
      <GymHero />
      <Marquee className="bg-hot text-cream" items={gym.interests} />
      <section className="mx-auto max-w-7xl px-4 pt-20 md:px-8">
        <ul className="grid grid-cols-2 gap-5 md:grid-cols-4">
          {gym.photos.map((p, i) => (
            <Reveal key={p.src} delay={i * 0.06}>
              <motion.li
                whileHover={{ rotate: 0, y: -6 }}
                className={`border-2 border-ink bg-cream p-2 pb-9 shadow-[var(--shadow-sticker)] ${i % 2 ? 'rotate-2' : '-rotate-2'}`}
              >
                <div className="aspect-[3/4] overflow-hidden border-2 border-ink">
                  <Photo photo={p} seed={i} />
                </div>
                <p className="-mb-7 mt-1 text-center font-hand text-lg leading-tight">{p.caption}</p>
              </motion.li>
            </Reveal>
          ))}
        </ul>
        <p className="mt-6 text-center">
          <a href={links.instagram} target="_blank" rel="noreferrer" className="font-hand text-2xl text-berry underline underline-offset-4">
            more gym chaos on {links.instagramHandle} →
          </a>
        </p>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <SectionTitle eyebrow="mini game" title={<>Beat my <span className="italic text-hot">reps.</span></>}>
          You have 10 seconds. Tap, click or mash the space bar to curl the dumbbell. My record is {gym.myRepRecord}. Think you can take it?
        </SectionTitle>
        <Reveal>
          <BeatMyReps />
        </Reveal>
      </section>
      <Scrapbook />
    </>
  )
}
