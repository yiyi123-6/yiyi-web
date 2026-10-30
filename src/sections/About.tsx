import { useRef, useState, type PointerEvent } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { Check, ChevronLeft, ChevronRight, Sparkles, Sword, Shield, Map } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { BackHome, Reveal, SectionTitle } from '../components/Bits'
import { Editable } from '../components/Editable'
import { InstagramIcon } from '../components/BrandIcons'
import { MUSIC_PAUSE, MUSIC_RESUME } from '../components/MusicPlayer'
import { about, links, photos, site } from '../data/content'
import { asset } from '../lib/asset'

function CharacterCard() {
  const reduce = useReducedMotion()
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const srx = useSpring(rx, { stiffness: 150, damping: 15 })
  const sry = useSpring(ry, { stiffness: 150, damping: 15 })
  const shine = useTransform(sry, [-12, 12], ['0%', '100%'])

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== 'mouse') return
    const r = e.currentTarget.getBoundingClientRect()
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 24)
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 24)
  }

  return (
    <div className="[perspective:1200px]">
      <motion.div
        onPointerMove={onMove}
        onPointerLeave={() => { rx.set(0); ry.set(0) }}
        style={{ rotateX: srx, rotateY: sry }}
        className="relative mx-auto max-w-md overflow-hidden rounded-[1.75rem] border-[3px] border-ink bg-hot p-3 shadow-[10px_10px_0_0_#21151D]"
      >
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 opacity-40 mix-blend-overlay"
          style={{ background: 'linear-gradient(115deg, transparent 30%, #fff 45%, transparent 60%)', backgroundSize: '250% 100%', backgroundPositionX: shine }}
        />
        <div className="rounded-[1.25rem] border-2 border-ink bg-cream p-5">
          <div className="flex items-center justify-between">
            <span className="chip !bg-ink text-cream">LVL {about.level}</span>
            <span className="font-mono text-xs text-ink/50">#001 · LEGENDARY</span>
          </div>
          <div className="my-3 rounded-2xl border-2 border-ink bg-baby px-8 pt-4">
            <Avatar />
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-ink/50">Name</p>
          <p className="font-display text-4xl font-black leading-none">{site.name}</p>
          <p className="mt-2 text-xs font-bold uppercase tracking-wider text-ink/50">Class</p>
          <p className="font-semibold">{about.characterClass}</p>
          <ul className="mt-4 space-y-2">
            {about.stats.map((s, i) => (
              <li key={s.name} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-2 text-sm">
                <span className="font-semibold">{s.name}</span>
                <span className="h-3 overflow-hidden rounded-full border-2 border-ink bg-blush">
                  <motion.span
                    className="block h-full bg-hot"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${s.value}%` }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 + i * 0.1, duration: 0.8 }}
                  />
                </span>
                <span className="text-right font-mono text-xs">{s.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </motion.div>
    </div>
  )
}

function Quests() {
  const [done, setDone] = useState<Record<number, boolean>>({})
  return (
    <div className="sticker bg-ink p-6 text-cream">
      <p className="flex items-center gap-2 font-display text-2xl font-black"><Map size={20} className="text-hot" /> Current side quests</p>
      <p className="text-sm text-cream/60">Go on, cheer me on. Tick one.</p>
      <ul className="mt-4 space-y-2">
        {about.sideQuests.map((q, i) => (
          <li key={q}>
            <button
              onClick={() => setDone((d) => ({ ...d, [i]: !d[i] }))}
              aria-pressed={!!done[i]}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-cream/20 px-3 py-2 text-left transition hover:border-hot"
            >
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 ${done[i] ? 'border-hot bg-hot' : 'border-cream/50'}`}>
                {done[i] && <Check size={14} />}
              </span>
              <span className={done[i] ? 'line-through opacity-60' : ''}>{q}</span>
              {done[i] && <span className="ml-auto font-hand text-lg text-baby">+50 XP</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

type ResumeItem = (typeof about.notOnResume)[number] & { youtubeId?: string }

function FlipCard({ item, index }: { item: ResumeItem; index: number }) {
  const [flipped, setFlipped] = useState(false)
  const song = item.youtubeId
  const title = item.title.replace(/[[\]]/g, '')
  const face = 'sticker absolute inset-0 [backface-visibility:hidden]'
  return (
    <div className="group h-56 w-full [perspective:1000px]">
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="relative h-full w-full [transform-style:preserve-3d]"
      >
        <button
          onClick={() => { setFlipped(true); if (song) window.dispatchEvent(new Event(MUSIC_PAUSE)) }}
          aria-hidden={flipped}
          tabIndex={flipped ? -1 : 0}
          aria-label={song ? `${title}. Play the song.` : `${title}. Flip to reveal.`}
          className={`${face} flex flex-col justify-between p-5 text-left ${index % 3 === 0 ? 'bg-baby' : index % 3 === 1 ? 'bg-cream' : 'bg-hot text-cream'} ${index % 2 ? 'rotate-1' : '-rotate-1'}`}
        >
          <span className="text-5xl transition group-hover:scale-110" aria-hidden>{item.emoji}</span>
          <span>
            <span className="block font-display text-2xl font-black leading-tight"><Editable text={item.title} /></span>
            <span className="mt-1 block font-hand text-xl opacity-70">{song ? 'tap to play ▶' : 'tap to flip ↻'}</span>
          </span>
        </button>
        <div aria-hidden={!flipped} className={`${face} flex flex-col bg-ink p-4 text-cream [transform:rotateY(180deg)]`}>
          {song ? (
            <>
              <div className="min-h-0 flex-1 overflow-hidden rounded-xl border-2 border-cream/30 bg-ink">
                {flipped && (
                  <iframe
                    className="h-full w-full"
                    src={`https://www.youtube-nocookie.com/embed/${song}?autoplay=1&rel=0&modestbranding=1`}
                    title={title}
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold">{item.body}</p>
                <button onClick={() => { setFlipped(false); window.dispatchEvent(new Event(MUSIC_RESUME)) }} tabIndex={flipped ? 0 : -1} className="shrink-0 rounded-full border-2 border-cream px-3 py-1 text-xs font-bold hover:bg-hot">
                  stop ■
                </button>
              </div>
            </>
          ) : (
            <button onClick={() => setFlipped(false)} tabIndex={flipped ? 0 : -1} aria-label={`${title}: ${item.body}. Flip back.`} className="flex h-full w-full items-center text-left">
              <span className="text-lg"><Editable text={item.body} /></span>
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}

function PhotoStrip() {
  const track = useRef<HTMLUListElement>(null)
  const [edge, setEdge] = useState({ start: true, end: false })
  const drag = useRef<{ x: number; left: number } | null>(null)

  const update = () => {
    const el = track.current
    if (!el) return
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 })
  }
  const endDrag = () => {
    if (!drag.current) return
    drag.current = null
    if (track.current) track.current.style.scrollSnapType = ''
  }
  const by = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: 'smooth' })

  return (
    <div className="relative">
      <ul
        ref={track}
        onScroll={update}
        tabIndex={0}
        aria-label="Photo dump — scroll sideways"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); by(1) }
          if (e.key === 'ArrowLeft') { e.preventDefault(); by(-1) }
        }}
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse' || !track.current) return
          drag.current = { x: e.clientX, left: track.current.scrollLeft }
          track.current.style.scrollSnapType = 'none'
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || !track.current) return
          track.current.scrollLeft = d.left - (e.clientX - d.x)
        }}
        onPointerUp={() => endDrag()}
        onPointerLeave={() => endDrag()}
        className="-mx-4 flex cursor-grab snap-x snap-mandatory gap-6 overflow-x-auto px-4 pb-8 pt-4 [scrollbar-color:#FF4FA3_transparent] [scrollbar-width:thin] active:cursor-grabbing md:-mx-8 md:px-8"
      >
        {photos.gallery.map((p, i) => (
          <li key={p.src} className="w-56 shrink-0 snap-center sm:w-64 md:w-72">
            <motion.figure
              whileHover={{ rotate: 0, y: -6 }}
              className={`select-none border-2 border-ink bg-cream p-2 pb-9 shadow-[var(--shadow-sticker)] ${i % 3 === 0 ? '-rotate-2' : i % 3 === 1 ? 'rotate-1' : 'rotate-2'}`}
            >
              <img src={asset(p.src)} alt={p.alt} loading="lazy" decoding="async" draggable={false} className="aspect-[4/5] w-full border-2 border-ink object-cover" />
              <figcaption className="-mb-7 mt-1 truncate text-center font-hand text-xl">{p.caption}</figcaption>
            </motion.figure>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="font-hand text-xl text-berry">{photos.gallery.length} photos · swipe, drag or use the arrows →</p>
        <div className="flex gap-2">
          <button onClick={() => by(-1)} disabled={edge.start} aria-label="Previous photos" className="btn-cream !p-2.5"><ChevronLeft size={18} /></button>
          <button onClick={() => by(1)} disabled={edge.end} aria-label="Next photos" className="btn-hot !p-2.5"><ChevronRight size={18} /></button>
        </div>
      </div>
    </div>
  )
}

export function About() {
  return (
    <>
      <section className="relative overflow-hidden border-b-2 border-ink bg-blush">
        <div className="dots absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-20 pt-8 md:px-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <BackHome />
            <p className="eyebrow mt-10">player one, ready</p>
            <h1 className="font-display text-[clamp(3rem,8.5vw,7.5rem)] font-black leading-[0.85] tracking-[-0.04em]">
              Beyond the <span className="italic text-hot">job title.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-ink/80">
              The official stats, straight from the character select screen. Hover the card for the shiny holographic effect, because of course it's holographic.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="sticker bg-cream p-5">
                <p className="flex items-center gap-2 font-display text-xl font-black"><Sparkles size={18} className="text-hot" /> Special abilities</p>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {about.abilities.map((a) => <li key={a} className="flex gap-2"><Sword size={14} className="mt-0.5 shrink-0 text-hot" /> {a}</li>)}
                </ul>
              </div>
              <div className="sticker bg-cream p-5">
                <p className="flex items-center gap-2 font-display text-xl font-black"><Shield size={18} className="text-berry" /> Weaknesses</p>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {about.weaknesses.map((w) => <li key={w} className="font-hand text-2xl text-berry">{w}…</li>)}
                </ul>
                <p className="mt-2 text-xs text-ink/50">(Still loading. Probably buffering forever.)</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-8">
            <CharacterCard />
            <Quests />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <SectionTitle eyebrow="the fine print" title={<>Things you won't find on my <span className="italic text-hot">résumé.</span></>}>
          Flip the cards. No recruiters were harmed in the making of this section.
        </SectionTitle>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {about.notOnResume.map((item, i) => (
            <Reveal key={i} delay={i * 0.05}>
              <FlipCard item={item} index={i} />
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-t-2 border-ink bg-baby py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">camera roll highlights</p>
              <h2 className="font-display text-4xl font-black leading-[0.95] tracking-tight md:text-6xl">
                Photo <span className="italic text-hot">dump.</span>
              </h2>
            </div>
            <a href={links.instagram} target="_blank" rel="noreferrer" className="btn-ink">
              <InstagramIcon size={18} /> Follow {links.instagramHandle}
            </a>
          </div>
          <PhotoStrip />
        </div>
      </section>
    </>
  )
}
