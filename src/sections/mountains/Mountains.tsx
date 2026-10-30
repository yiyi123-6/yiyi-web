import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight, Clock, Footprints, MapPin, Mountain, MountainSnow, TrendingUp } from 'lucide-react'
import { BackHome, Reveal, SectionTitle } from '../../components/Bits'
import { Editable } from '../../components/Editable'
import { Photo } from '../../components/Photo'
import { site, type Photo as PhotoT } from '../../data/content'
import data from '../../data/hikes.json'
import { photosForHike, useLivePhotoFiles } from '../../lib/hikePhotos'
import { useHashSubpath } from '../../lib/router'
import { useUniverse } from '../../lib/universe'

/** Shape of an entry in hikes.json. Everything after `takeaway` is optional and filled in by `npm run import:garmin`. */
interface Hike {
  id: string
  name: string
  location: string
  /** Optional free text ("Summer 2025"). Garmin imports never write it: the repo is public. */
  date?: string
  distance: number
  elevationGain: number
  difficulty: string
  photos: PhotoT[]
  experience: string
  takeaway: string
  maxElevation?: number
  /** seconds */
  movingTime?: number
  /** seconds */
  elapsedTime?: number
  /** elevations along the trail, evenly spaced by distance */
  profile?: number[]
  garminActivityId?: string
  /** set when one outing was recorded as several Garmin activities and merged */
  garminActivityIds?: string[]
  source?: string
}

const hikes = data.hikes as Hike[]
const { dreams, units } = data

const DIFFICULTY: Record<string, number> = { Easy: 1, Moderate: 2, Hard: 3, Epic: 4 }
/** Past this many hikes the map switches to numbered pins and gets wide enough to scroll on small screens. */
const DENSE = 8
const PIN_SPACING_PX = 46

function hash(s: string) {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296)
}

/** A plausible-looking elevation profile, deterministic per hike. Purely decorative. */
function profilePath(h: Hike, w = 300, ht = 80) {
  const rnd = hash(h.id)
  const n = 24
  const peakAt = 0.45 + rnd() * 0.2
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    const base = Math.max(0, 1 - Math.abs(t - peakAt) / Math.max(peakAt, 1 - peakAt))
    const v = Math.pow(base, 1.3) * 0.85 + rnd() * 0.12
    return [t * w, ht - 6 - v * (ht - 14)] as const
  })
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

/** The recorded elevation profile, scaled to fit the same box. */
function realProfilePath(profile: number[], w = 300, ht = 80) {
  const lo = Math.min(...profile)
  const range = Math.max(Math.max(...profile) - lo, 1)
  return profile
    .map((e, i) => {
      const x = (i / Math.max(1, profile.length - 1)) * w
      const y = ht - 6 - ((e - lo) / range) * (ht - 14)
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

function GrowingRange() {
  const { findSecret, secretsFound } = useUniverse()
  const found = useRef(secretsFound.includes('mountain'))
  const grow = () => {
    if (found.current) return
    found.current = true
    findSecret('mountain', 'Secret unlocked: mountains grow when you notice them 🏔️', '🌱')
  }
  const peaks = [
    { d: 'M-20 300 L120 120 L200 200 L300 60 L420 300 Z', fill: '#8B1E55', origin: '300px 300px' },
    { d: 'M260 300 L420 90 L520 190 L600 130 L760 300 Z', fill: '#FF4FA3', origin: '420px 300px' },
    { d: 'M560 300 L700 150 L780 210 L860 100 L1020 300 Z', fill: '#21151D', origin: '860px 300px' },
  ]
  return (
    <svg viewBox="0 0 1000 300" className="w-full" preserveAspectRatio="xMidYMax meet">
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.path
          key={i}
          d={`M0 ${80 + i * 34} Q 250 ${50 + i * 34} 500 ${84 + i * 34} T 1000 ${70 + i * 34}`}
          fill="none"
          stroke="#FF4FA3"
          strokeOpacity={0.35 - i * 0.05}
          strokeWidth="2"
          strokeDasharray="6 8"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2.4, delay: i * 0.2 }}
          aria-hidden
        />
      ))}
      {peaks.map((p, i) => (
        <motion.path
          key={i}
          d={p.d}
          fill={p.fill}
          stroke="#21151D"
          strokeWidth="3"
          style={{ transformOrigin: p.origin }}
          whileHover={{ scaleY: 1.18, scaleX: 1.04 }}
          whileFocus={{ scaleY: 1.18, scaleX: 1.04 }}
          onHoverStart={grow}
          onTap={grow}
          onFocus={grow}
          tabIndex={0}
          role="button"
          aria-label="A mountain. Pay it some attention."
          transition={{ type: 'spring', stiffness: 200, damping: 12 }}
          className="cursor-pointer"
        />
      ))}
      <path d="M285 82 L300 60 L315 82 L305 76 L298 86 Z" fill="#FFFDF8" pointerEvents="none" />
      <path d="M402 114 L420 90 L436 112 L424 106 L416 116 Z" fill="#FFFDF8" pointerEvents="none" />
    </svg>
  )
}

function MountainHero() {
  return (
    <section className="relative overflow-hidden border-b-2 border-ink bg-blush">
      <div className="mx-auto max-w-7xl px-4 pt-8 md:px-8">
        <BackHome />
        <div className="mt-10 grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-end">
          <div>
            <p className="eyebrow">world 03 · the adventure journal</p>
            <h1 className="font-display text-[clamp(3rem,9.5vw,8.5rem)] font-black leading-[0.85] tracking-[-0.04em]">
              Chasing <span className="italic text-hot">summits</span>
            </h1>
          </div>
          <div className="space-y-3 pb-2">
            <p className="sticker inline-block rotate-2 bg-cream px-4 py-2 font-hand text-2xl">{site.currently}</p>
            <p className="sticker inline-block -rotate-1 bg-hot px-4 py-2 font-hand text-2xl text-cream">The view is better after the climb.</p>
          </div>
        </div>
      </div>
      <div className="mt-6">
        <GrowingRange />
      </div>
    </section>
  )
}

function catmull(points: { x: number; y: number }[]) {
  if (points.length < 2) return ''
  let d = `M${points[0].x},${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
    d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`
  }
  return d
}

function SummitQuest() {
  const [idx, setIdx] = useState(0)
  const mapRef = useRef<HTMLDivElement>(null)
  const W = 1000, H = 420
  const dense = hikes.length > DENSE
  // sqrt so one huge day doesn't flatten every other pin onto the floor
  const maxEl = Math.sqrt(Math.max(...hikes.map((h) => h.elevationGain), 1))
  const pins = hikes.map((h, i) => ({
    x: 80 + (i * (W - 160)) / Math.max(1, hikes.length - 1),
    y: H - 70 - (Math.sqrt(Math.max(0, h.elevationGain)) / maxEl) * (H - 160),
  }))
  const trail = catmull([{ x: 10, y: H - 30 }, ...pins, { x: W - 10, y: pins[pins.length - 1]?.y ?? H / 2 }])
  const hike = hikes[idx]
  const livePhotos = useLivePhotoFiles()
  const photos = photosForHike(hike.id, hike.photos, livePhotos)
  const label = (h: Hike) => h.name.replace(/[[\]]/g, '')

  const totalKm = hikes.reduce((s, h) => s + h.distance, 0)
  const totalEl = hikes.reduce((s, h) => s + h.elevationGain, 0)

  useEffect(() => {
    const el = mapRef.current
    if (!el || el.scrollWidth <= el.clientWidth) return
    el.scrollTo({ left: (pins[idx].x / W) * el.scrollWidth - el.clientWidth / 2, behavior: 'smooth' })
  }, [idx])

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
      <SectionTitle eyebrow="interactive map" title={<>The summit <span className="italic text-hot">quest.</span></>}>
        Follow the trail. Each pin is a hike I've done; the higher it sits, the more I climbed. Click one to open its journal page.
      </SectionTitle>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { icon: Mountain, label: 'Summits logged', value: hikes.length },
          { icon: Footprints, label: 'Total distance', value: `${totalKm.toFixed(1)} ${units.distance}` },
          { icon: TrendingUp, label: 'Total climbed', value: `${totalEl.toLocaleString()} ${units.elevation}` },
          { icon: MapPin, label: 'Eiffel Towers stacked', value: (totalEl / 330).toFixed(1) },
        ].map((s, i) => (
          <Reveal key={s.label} delay={i * 0.05}>
            <div className={`sticker p-4 ${i === 3 ? 'bg-hot text-cream' : 'bg-cream'}`}>
              <s.icon size={18} className={i === 3 ? '' : 'text-hot'} />
              <p className="mt-2 font-display text-3xl font-black">{s.value}</p>
              <p className="text-xs font-bold uppercase tracking-wider opacity-60">{s.label}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <div className="sticker relative overflow-hidden bg-baby">
        <div className="grid-paper absolute inset-0 opacity-70" aria-hidden />
        <div ref={mapRef} className="relative overflow-x-auto overscroll-x-contain">
          <div
            className="relative aspect-[1000/420] w-full min-h-[260px]"
            style={dense ? { minWidth: `${hikes.length * PIN_SPACING_PX}px` } : undefined}
          >
            <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
              <path d={`M0 ${H} L150 220 L260 300 L420 140 L560 260 L720 110 L860 230 L1000 160 L1000 ${H} Z`} fill="#FF4FA3" opacity=".18" />
              <path d={`M0 ${H} L120 300 L300 340 L480 250 L640 330 L820 270 L1000 320 L1000 ${H} Z`} fill="#8B1E55" opacity=".18" />
              <path d={trail} fill="none" stroke="#FFFDF8" strokeWidth="14" strokeLinecap="round" />
              <motion.path
                d={trail}
                fill="none"
                stroke="#21151D"
                strokeWidth="4"
                strokeDasharray="2 14"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 2 }}
              />
            </svg>
            {pins.map((p, i) => {
              const on = i === idx
              const h = hikes[i]
              const edge = p.x < W * 0.2 ? 'left-0' : p.x > W * 0.8 ? 'right-0' : 'left-1/2 -translate-x-1/2'
              return (
                <motion.button
                  key={h.id}
                  onClick={() => setIdx(i)}
                  aria-pressed={on}
                  aria-label={`${label(h)}: ${h.distance} ${units.distance}, ${h.elevationGain} ${units.elevation} gain`}
                  className={`absolute -translate-x-1/2 -translate-y-full ${on ? 'z-10' : ''}`}
                  style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` }}
                  whileHover={{ y: -6, scale: 1.08 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {dense ? (
                    <span className="relative block">
                      {on && (
                        <span className={`absolute bottom-full mb-1 whitespace-nowrap rounded-full border-2 border-ink bg-ink px-2.5 py-1 text-xs font-bold text-cream shadow-[var(--shadow-sticker)] md:text-sm ${edge}`}>
                          {i + 1}. {label(h)}
                        </span>
                      )}
                      <span
                        className={`grid h-8 w-8 place-items-center rounded-full border-2 border-ink text-xs font-black shadow-[2px_2px_0_0_#21151D] ${on ? 'bg-hot text-base' : 'bg-cream'}`}
                        title={label(h)}
                      >
                        {on ? '🚩' : i + 1}
                      </span>
                    </span>
                  ) : (
                    <span className={`flex flex-col items-center ${on ? '' : 'opacity-90'}`}>
                      <span className={`whitespace-nowrap rounded-full border-2 border-ink px-2.5 py-1 text-xs font-bold shadow-[var(--shadow-sticker)] md:text-sm ${on ? 'bg-ink text-cream' : 'bg-cream'}`}>
                        {i + 1}<span className={on ? 'hidden sm:inline' : 'hidden md:inline'}>. {label(h)}</span>
                      </span>
                      <span className={`mt-1 grid h-9 w-9 place-items-center rounded-full border-2 border-ink text-lg ${on ? 'bg-hot' : 'bg-cream'}`}>
                        {on ? '🚩' : '⛰️'}
                      </span>
                    </span>
                  )}
                </motion.button>
              )
            })}
          </div>
        </div>
      </div>
      {dense && (
        <p className="mt-2 text-xs font-bold uppercase tracking-wider text-ink/50 lg:hidden">← swipe the trail →</p>
      )}

      {dense && (
        <nav aria-label="All trails" className="-mx-4 mt-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
          <ol className="flex gap-2 md:flex-wrap">
            {hikes.map((h, i) => (
              <li key={h.id} className="shrink-0">
                <button
                  onClick={() => setIdx(i)}
                  aria-current={i === idx}
                  className={`whitespace-nowrap rounded-full border-2 border-ink px-3 py-1 text-xs font-bold transition hover:-translate-y-0.5 ${i === idx ? 'bg-ink text-cream' : 'bg-cream'}`}
                >
                  <span className={i === idx ? 'text-baby' : 'text-hot'}>{i + 1}</span> {label(h)}
                  <span className="ml-1 font-semibold opacity-60">{h.distance} {units.distance}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <AnimatePresence mode="wait">
        <motion.article
          key={hike.id}
          initial={{ opacity: 0, y: 20, rotate: -0.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_1fr]"
          aria-live="polite"
        >
          <div className="sticker bg-cream p-6 md:p-8" style={{ backgroundImage: 'repeating-linear-gradient(transparent 0 31px, rgb(255 79 163 / .15) 31px 32px)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="chip">journal page {idx + 1}/{hikes.length}</span>
              {hike.date && <span className="font-hand text-xl text-berry"><Editable text={hike.date} /></span>}
            </div>
            <h3 className="mt-4 font-display text-4xl font-black leading-none md:text-5xl"><Editable text={hike.name} /></h3>
            <p className="mt-2 inline-flex items-center gap-1 text-ink/70"><MapPin size={16} /> <Editable text={hike.location} /></p>

            <dl className="mt-6 grid grid-cols-3 gap-3">
              <div className="rounded-xl border-2 border-ink bg-blush p-3">
                <dt className="text-xs font-bold uppercase text-ink/60">Distance</dt>
                <dd className="font-display text-2xl font-black">{hike.distance}<span className="text-sm"> {units.distance}</span></dd>
              </div>
              <div className="rounded-xl border-2 border-ink bg-blush p-3">
                <dt className="text-xs font-bold uppercase text-ink/60">Elevation</dt>
                <dd className="font-display text-2xl font-black">{hike.elevationGain}<span className="text-sm"> {units.elevation}</span></dd>
              </div>
              <div className="rounded-xl border-2 border-ink bg-blush p-3">
                <dt className="text-xs font-bold uppercase text-ink/60">Difficulty</dt>
                <dd className="font-display text-xl font-black">{hike.difficulty}</dd>
                <dd className="mt-1 flex gap-1" aria-hidden>
                  {[1, 2, 3, 4].map((n) => (
                    <span key={n} className={`h-2 flex-1 rounded-full ${n <= (DIFFICULTY[hike.difficulty] ?? 2) ? 'bg-hot' : 'bg-ink/10'}`} />
                  ))}
                </dd>
              </div>
            </dl>

            {(hike.movingTime || hike.elapsedTime || hike.maxElevation != null) ? (
              <div className="mt-3 flex flex-wrap gap-2 text-sm font-bold">
                {!!hike.movingTime && (
                  <span className="chip"><Clock size={14} /> {formatDuration(hike.movingTime)} moving</span>
                )}
                {!!hike.elapsedTime && hike.elapsedTime - (hike.movingTime ?? 0) >= 60 && (
                  <span className="chip"><Clock size={14} /> {formatDuration(hike.elapsedTime)} total</span>
                )}
                {hike.maxElevation != null && (
                  <span className="chip"><MountainSnow size={14} /> high point {hike.maxElevation.toLocaleString()} {units.elevation}</span>
                )}
              </div>
            ) : null}

            <svg viewBox="0 0 300 80" className="mt-5 w-full" aria-hidden>
              {hike.profile && hike.profile.length > 1 && (
                <path d={`${realProfilePath(hike.profile)} L300,76 L0,76 Z`} fill="#FF4FA3" opacity=".12" />
              )}
              <motion.path
                d={hike.profile && hike.profile.length > 1 ? realProfilePath(hike.profile) : profilePath(hike)}
                fill="none"
                stroke="#FF4FA3"
                strokeWidth="3"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.2 }}
              />
              <line x1="0" x2="300" y1="76" y2="76" stroke="#21151D" strokeOpacity=".2" strokeWidth="2" />
            </svg>
            <p className="text-right text-[10px] uppercase tracking-wider text-ink/40">
              {hike.profile && hike.profile.length > 1
                ? `elevation profile (from Garmin) · ${Math.min(...hike.profile)}–${Math.max(...hike.profile)} ${units.elevation}`
                : 'elevation profile (illustrative)'}
            </p>

            <p className="mt-4 text-lg leading-8"><Editable text={hike.experience} /></p>
            <div className="mt-5 rotate-1 rounded-lg bg-baby p-4 shadow-[3px_3px_0_0_#21151D]">
              <p className="text-xs font-bold uppercase tracking-wider text-berry">takeaway</p>
              <p className="font-hand text-3xl leading-tight"><Editable text={hike.takeaway} /></p>
            </div>

            <div className="mt-6 flex justify-between">
              <button className="btn-cream !py-2 text-sm" onClick={() => setIdx((idx - 1 + hikes.length) % hikes.length)}>
                <ChevronLeft size={16} /> Previous
              </button>
              <button className="btn-ink !py-2 text-sm" onClick={() => setIdx((idx + 1) % hikes.length)}>
                Next trail <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="grid auto-rows-[minmax(10rem,1fr)] grid-cols-2 gap-4">
            {photos.map((ph, i) => (
              <figure
                key={ph.src || i}
                className={`sticker overflow-hidden bg-cream p-2 pb-8 ${photos.length === 1 || i === 0 ? 'col-span-2' : ''} ${i % 2 ? 'rotate-2' : '-rotate-1'}`}
              >
                <div className="h-full min-h-40 overflow-hidden rounded-lg border-2 border-ink">
                  <Photo photo={ph} seed={i + idx} hint={import.meta.env.DEV ? `photos/mountains/${hike.id}/` : undefined} />
                </div>
                {ph.caption && <figcaption className="-mb-6 mt-1 text-center font-hand text-xl">{ph.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </motion.article>
      </AnimatePresence>
    </section>
  )
}

function Dreams() {
  return (
    <section className="border-t-2 border-ink bg-ink py-20 text-cream">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <p className="font-hand text-2xl text-baby">the bucket list</p>
        <h2 className="font-display text-4xl font-black leading-[0.95] md:text-6xl">
          Future dream <span className="italic text-hot">adventures.</span>
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {dreams.map((d, i) => (
            <Reveal key={i} delay={i * 0.06}>
              <motion.div
                whileHover={{ y: -8, rotate: i % 2 ? 2 : -2 }}
                className="relative h-full rounded-2xl border-2 border-dashed border-cream/50 p-6 transition hover:border-hot hover:bg-cream/5"
              >
                <span className="absolute -right-3 -top-3 rotate-12 rounded-full border-2 border-cream bg-hot px-2 py-1 text-[10px] font-black uppercase tracking-wider">
                  someday
                </span>
                <p className="text-5xl">{d.emoji}</p>
                <p className="mt-4 font-display text-2xl font-black"><Editable text={d.name} /></p>
                <p className="text-baby"><Editable text={d.where} /></p>
                <p className="mt-3 text-sm text-cream/70"><Editable text={d.why} /></p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

const AddPhotos = lazy(() => import('./AddPhotos'))

export function Mountains() {
  const sub = useHashSubpath()
  if (sub === 'add-photo') {
    return (
      <Suspense fallback={<div className="min-h-screen" />}>
        <AddPhotos />
      </Suspense>
    )
  }
  return (
    <>
      <MountainHero />
      <SummitQuest />
      <Dreams />
    </>
  )
}
