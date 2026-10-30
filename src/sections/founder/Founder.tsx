import { useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { BackHome, Reveal } from '../../components/Bits'
import { Editable } from '../../components/Editable'
import { Photo } from '../../components/Photo'
import { founder } from '../../data/content'

const TAPE = 'absolute -top-3 left-1/2 h-6 w-20 -translate-x-1/2 rotate-[-4deg] bg-baby/80 border border-ink/10'
const NOTE_COLORS = ['bg-baby', 'bg-[#FFF3B0]', 'bg-hot text-cream', 'bg-[#D8F3E8]', 'bg-blush', 'bg-[#FFE0C7]']

function FounderHero() {
  return (
    <section className="relative overflow-hidden border-b-2 border-ink bg-cream">
      <div className="dots absolute inset-0" aria-hidden />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-8 md:px-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <BackHome />
          <p className="eyebrow mt-10">world 04 · the founder scrapbook</p>
          <h1 className="font-display text-[clamp(3rem,9.5vw,8.5rem)] font-black leading-[0.85] tracking-[-0.04em]">
            My founder <span className="relative inline-block italic text-hot">
              era
              <svg viewBox="0 0 200 20" className="absolute -bottom-2 left-0 w-full" aria-hidden>
                <path d="M2 14 Q 50 2 100 12 T 198 8" fill="none" stroke="#21151D" strokeWidth="4" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink/80">
            Before the models and the metrics, I started a company called <b>{founder.company}</b>. This is the scrapbook of that chapter: the spark, the
            scrappy building, the plot twists, and everything it taught me.
          </p>
        </div>

        <div className="relative min-h-[22rem]">
          <motion.div
            initial={{ rotate: -14, opacity: 0, y: 30 }}
            animate={{ rotate: -6, opacity: 1, y: 0 }}
            className="sticker absolute left-4 top-4 grid h-44 w-44 place-items-center bg-hot text-center text-cream md:h-52 md:w-52"
          >
            <div>
              <p className="text-5xl" aria-hidden>🥡</p>
              <p className="font-display text-3xl font-black">{founder.company}</p>
              <p className="font-hand text-lg">est. <Editable text={founder.facts[0].value} /></p>
            </div>
          </motion.div>
          <ul className="absolute bottom-0 right-0 w-64 space-y-2">
            {founder.facts.map((f, i) => (
              <motion.li
                key={f.label}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className={`sticker bg-cream px-4 py-2 text-sm ${i % 2 ? 'rotate-1' : '-rotate-1'}`}
              >
                <span className="font-bold uppercase tracking-wider text-berry">{f.label}: </span>
                <Editable text={f.value} />
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function Journey() {
  const [i, setI] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const ch = founder.chapters[i]
  const n = founder.chapters.length

  const go = (next: number) => {
    const k = (next + n) % n
    setI(k)
    tabs.current[k]?.focus()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1) }
    if (e.key === 'Home') { e.preventDefault(); go(0) }
    if (e.key === 'End') { e.preventDefault(); go(n - 1) }
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
      <p className="eyebrow">the journey, in six polaroids</p>
      <h2 className="font-display text-4xl font-black leading-[0.95] tracking-tight md:text-6xl">
        From napkin sketch to <span className="italic text-hot">lessons learned.</span>
      </h2>

      <div role="tablist" aria-label="LunchMe journey chapters" onKeyDown={onKey} className="mt-10 flex gap-3 overflow-x-auto px-1 pb-4 pt-2 [scrollbar-width:thin]">
        {founder.chapters.map((c, k) => {
          const on = k === i
          return (
            <button
              key={c.id}
              ref={(el) => { tabs.current[k] = el }}
              role="tab"
              id={`tab-${c.id}`}
              aria-selected={on}
              aria-controls="chapter-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => setI(k)}
              className={`group relative shrink-0 rounded-md border-2 border-ink bg-cream p-2 pb-3 text-left shadow-[var(--shadow-sticker)] transition ${
                on ? '-translate-y-2 rotate-0 bg-baby' : k % 2 ? 'rotate-2 hover:rotate-0' : '-rotate-2 hover:rotate-0'
              }`}
            >
              <span className="grid h-20 w-28 place-items-center rounded-sm bg-blush text-4xl md:h-24 md:w-36">{c.emoji}</span>
              <span className="mt-2 block font-hand text-lg leading-none">
                {String(k + 1).padStart(2, '0')} · {c.title}
              </span>
              {on && <motion.span layoutId="pin" className="absolute -top-2 right-3 h-4 w-4 rounded-full border-2 border-ink bg-hot" />}
            </button>
          )
        })}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10" aria-hidden>
        <motion.div className="h-full bg-hot" animate={{ width: `${((i + 1) / n) * 100}%` }} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={ch.id}
          id="chapter-panel"
          role="tabpanel"
          aria-labelledby={`tab-${ch.id}`}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.3 }}
          className="mt-10 grid items-start gap-10 md:grid-cols-[0.9fr_1.1fr]"
        >
          <div className="relative mx-auto w-full max-w-sm">
            <figure className="relative -rotate-3 border-2 border-ink bg-cream p-3 pb-14 shadow-[var(--shadow-sticker-lg)]">
              <span className={TAPE} aria-hidden />
              <div className="aspect-square overflow-hidden border-2 border-ink">
                <Photo photo={ch.photo} seed={i + 3} />
              </div>
              <figcaption className="absolute inset-x-0 bottom-3 text-center font-hand text-2xl">{ch.photo.caption}</figcaption>
            </figure>
            <motion.div
              initial={{ rotate: 12, scale: 0.8 }}
              animate={{ rotate: 6, scale: 1 }}
              className={`absolute -bottom-6 -right-4 w-40 p-3 font-hand text-2xl leading-tight shadow-[4px_4px_0_0_#21151D] md:-right-10 ${NOTE_COLORS[i % NOTE_COLORS.length]}`}
            >
              {ch.sticky}
            </motion.div>
          </div>

          <div className="relative">
            <p className="font-mono text-sm text-berry">chapter {String(i + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}</p>
            <h3 className="mt-1 font-display text-4xl font-black leading-none md:text-6xl">
              <span aria-hidden>{ch.emoji} </span>{ch.title}
            </h3>
            <p className="mt-6 text-xl leading-relaxed"><Editable text={ch.body} /></p>
            <svg viewBox="0 0 120 60" className="mt-4 w-28 text-hot" aria-hidden>
              <path d="M5 10 Q 60 60 110 30" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <path d="M100 22 L111 30 L99 38" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <p className="-mt-2 ml-28 font-hand text-xl text-berry">use ← → keys to flip pages</p>
            <div className="mt-8 flex gap-3">
              <button className="btn-cream !py-2 text-sm" onClick={() => setI((i - 1 + n) % n)}><ChevronLeft size={16} /> Previous</button>
              <button className="btn-hot !py-2 text-sm" onClick={() => setI((i + 1) % n)}>
                {i === n - 1 ? 'Back to the start' : 'Next chapter'} <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </section>
  )
}

function Prototype() {
  return (
    <section className="border-y-2 border-ink bg-baby py-20">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 md:grid-cols-2 md:px-8">
        <Reveal>
          <p className="eyebrow">from the archive</p>
          <h2 className="font-display text-4xl font-black leading-[0.95] md:text-6xl">Prototype <span className="italic text-hot">mockups.</span></h2>
          <p className="mt-4 max-w-md text-lg text-ink/75">
            Every startup has a folder of screenshots that make you cringe and smile at the same time. Here's where mine go.
          </p>
          <ul className="mt-6 space-y-2 font-hand text-2xl text-berry">
            <li>→ v0.1: held together with optimism</li>
            <li>→ v0.2: <Editable text="[what changed?]" /></li>
            <li>→ v1.0: <Editable text="[the version you were proudest of]" /></li>
          </ul>
        </Reveal>
        <Reveal delay={0.1} className="relative mx-auto">
          <div className="relative flex gap-4">
            {[0, 1].map((k) => (
              <motion.div
                key={k}
                whileHover={{ y: -10, rotate: 0 }}
                className={`w-44 rounded-[2.2rem] border-[3px] border-ink bg-ink p-2 shadow-[var(--shadow-sticker-lg)] md:w-56 ${k ? 'mt-12 rotate-3' : '-rotate-3'}`}
              >
                <div className="relative aspect-[9/19] overflow-hidden rounded-[1.7rem] bg-cream">
                  <div className="mx-auto mt-2 h-4 w-16 rounded-full bg-ink" />
                  <div className="p-3">
                    <p className="font-display text-lg font-black">{founder.company} <span className="text-hot">♡</span></p>
                    <div className="mt-3 space-y-2">
                      {[0, 1, 2].map((r) => (
                        <div key={r} className="flex items-center gap-2 rounded-xl border-2 border-ink/15 p-2">
                          <span className="h-8 w-8 rounded-lg bg-baby" />
                          <span className="flex-1 space-y-1">
                            <span className="block h-2 w-3/4 rounded bg-ink/20" />
                            <span className="block h-2 w-1/2 rounded bg-ink/10" />
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 rounded-full bg-hot py-2 text-center text-xs font-bold text-cream">main action</div>
                  </div>
                  <p className="absolute inset-x-0 bottom-4 text-center text-[10px] font-bold uppercase tracking-wider text-ink/40">screenshot placeholder {k + 1}</p>
                </div>
              </motion.div>
            ))}
            <span className="absolute -right-4 -top-6 rotate-12 rounded-md bg-[#FFF3B0] px-3 py-2 font-hand text-xl shadow-[3px_3px_0_0_#21151D]">
              swap in real screens!
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function Quote() {
  return (
    <section className="relative overflow-hidden bg-ink py-24 text-cream">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <Reveal>
          <p aria-hidden className="font-display text-[10rem] font-black leading-[0.5] text-hot">“</p>
          <blockquote className="font-display text-[clamp(2rem,5.5vw,4.8rem)] font-black italic leading-[1.02] tracking-tight">
            {founder.quote}
          </blockquote>
          <p className="mt-6 font-hand text-3xl text-baby">— me, on every scary decision</p>
        </Reveal>
      </div>
    </section>
  )
}

export function Founder() {
  return (
    <>
      <FounderHero />
      <Journey />
      <Quote />
      <Prototype />
    </>
  )
}
