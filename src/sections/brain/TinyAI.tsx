import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { Cloud, CloudRain, Dices, RotateCcw, Snowflake, Sparkles, Sun, Send, Target, ThumbsDown, ThumbsUp } from 'lucide-react'
import { FEATURES, ITEMS, pick, scoreItems, type Pick, type Prefs, type Weather } from './tinyAi'
import { confettiFrom } from '../../lib/confetti'
import { site } from '../../data/content'
import { InviteForm } from '../../components/InviteForm'

const WEATHER: { id: Weather; label: string; icon: typeof Sun }[] = [
  { id: 'sunny', label: 'Sunny', icon: Sun },
  { id: 'rainy', label: 'Rainy', icon: CloudRain },
  { id: 'snowy', label: 'Snowy', icon: Snowflake },
]
const TIME = [
  { hours: 1.5, label: '~1 hour' },
  { hours: 3, label: 'Half day' },
  { hours: 10, label: 'All day' },
]

const DEFAULT_PREFS: Prefs = { adventure: 0.85, energy: 0.8, brainy: 0.3, social: 0.3 }

function Segmented<T extends string | number>({
  label, options, value, onChange,
}: {
  label: string
  options: { value: T; label: string; icon?: typeof Sun }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold uppercase tracking-wider text-ink/60">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const Icon = o.icon
          const on = o.value === value
          return (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={`inline-flex items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1.5 text-sm font-semibold transition ${
                on ? 'bg-ink text-cream' : 'bg-cream hover:bg-baby'
              }`}
            >
              {Icon && <Icon size={15} />} {o.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export function TinyAI() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [weather, setWeather] = useState<Weather>('sunny')
  const [hours, setHours] = useState(10)
  const [epsilon, setEpsilon] = useState(0.2)
  const [bias, setBias] = useState<Record<string, number>>({})
  const [current, setCurrent] = useState<Pick | null>(null)
  const [voted, setVoted] = useState<'up' | 'down' | null>(null)
  const [inviting, setInviting] = useState(false)
  const [stats, setStats] = useState({ explore: 0, exploit: 0, exploreLikes: 0, exploitLikes: 0 })
  const cardRef = useRef<HTMLDivElement>(null)

  const ranked = useMemo(() => scoreItems(prefs, { weather, hours }, bias), [prefs, weather, hours, bias])
  const top = ranked[0]
  const stale = current && current.mode === 'exploit' && current.scored.item.id !== top.item.id

  const recommend = () => {
    const p = pick(ranked, epsilon)
    setCurrent(p)
    setVoted(null)
    setInviting(false)
    setStats((s) => ({ ...s, [p.mode]: s[p.mode] + 1 }))
  }

  const vote = (dir: 'up' | 'down') => {
    if (!current || voted) return
    const id = current.scored.item.id
    setBias((b) => ({ ...b, [id]: Math.max(-0.5, Math.min(0.5, (b[id] ?? 0) + (dir === 'up' ? 0.12 : -0.18))) }))
    setVoted(dir)
    if (dir === 'up') {
      setStats((s) => ({ ...s, [current.mode === 'explore' ? 'exploreLikes' : 'exploitLikes']: s[current.mode === 'explore' ? 'exploreLikes' : 'exploitLikes'] + 1 }))
      if (current.mode === 'explore') confettiFrom(cardRef.current)
    }
  }

  const reset = () => {
    setPrefs(DEFAULT_PREFS); setWeather('sunny'); setHours(10); setEpsilon(0.2)
    setBias({}); setCurrent(null); setVoted(null)
    setStats({ explore: 0, exploit: 0, exploreLikes: 0, exploitLikes: 0 })
  }

  const learned = Object.entries(bias).filter(([, v]) => v !== 0)
  const shown = current ? ranked.find((r) => r.item.id === current.scored.item.id)! : null
  const bestMatches = shown ? [...shown.matches].sort((a, b) => b.match - a.match).slice(0, 2) : []

  return (
    <div className="sticker grid-paper overflow-hidden bg-cream">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink bg-ink px-5 py-3 text-cream">
        <p className="flex items-center gap-2 font-mono text-sm">
          <span className="h-3 w-3 rounded-full bg-hot" />
          <span className="h-3 w-3 rounded-full bg-baby" />
          <span className="h-3 w-3 rounded-full bg-cream" />
          <span className="ml-2">tiny_ai.what_should_we_do(you, yiyi, context)</span>
        </p>
        <button onClick={reset} className="inline-flex items-center gap-1 text-sm text-cream/70 hover:text-hot">
          <RotateCcw size={14} /> reset model
        </button>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,22rem)_1fr]">
        {/* inputs */}
        <div className="space-y-6 border-b-2 border-ink bg-blush/80 p-5 lg:border-b-0 lg:border-r-2">
          <div>
            <p className="font-display text-2xl font-black">1. Tell it about you</p>
            <p className="text-sm text-ink/60">How do you like to hang out? These are your <b>features</b>, the numbers a model learns from.</p>
          </div>
          {FEATURES.map((f) => (
            <label key={f.key} className="block">
              <span className="flex items-baseline justify-between text-sm font-bold">
                {f.label} <span className="font-mono text-berry">{Math.round(prefs[f.key] * 100)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(prefs[f.key] * 100)}
                onChange={(e) => setPrefs((p) => ({ ...p, [f.key]: Number(e.target.value) / 100 }))}
                className="mt-1 w-full accent-hot"
                aria-valuetext={`${Math.round(prefs[f.key] * 100)} out of 100`}
              />
              <span className="flex justify-between text-xs text-ink/50">
                <span>{f.low}</span>
                <span>{f.high}</span>
              </span>
            </label>
          ))}

          <div>
            <p className="font-display text-2xl font-black">2. Set the context</p>
            <p className="text-sm text-ink/60">Same person, different day, different answer. That's <b>contextual</b> recommendation.</p>
          </div>
          <Segmented label="Weather" options={WEATHER.map((w) => ({ value: w.id, label: w.label, icon: w.icon }))} value={weather} onChange={setWeather} />
          <Segmented label="Time available" options={TIME.map((t) => ({ value: t.hours, label: t.label }))} value={hours} onChange={setHours} />

          <div>
            <p className="font-display text-2xl font-black">3. Curiosity dial</p>
            <label className="mt-2 block">
              <span className="flex items-baseline justify-between text-sm font-bold">
                Exploration rate (ε) <span className="font-mono text-berry">{Math.round(epsilon * 100)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={60}
                value={Math.round(epsilon * 100)}
                onChange={(e) => setEpsilon(Number(e.target.value) / 100)}
                className="mt-1 w-full accent-hot"
                aria-valuetext={`${Math.round(epsilon * 100)} percent`}
              />
              <span className="flex justify-between text-xs text-ink/50">
                <span>always play it safe</span>
                <span>surprise me</span>
              </span>
            </label>
          </div>
        </div>

        {/* output */}
        <div className="space-y-6 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={recommend} className="btn-hot text-lg">
              <Sparkles size={18} /> What should we do together?
            </button>
            <span className="font-hand text-xl text-berry">← then rate it so the model learns your taste</span>
          </div>

          <div ref={cardRef} aria-live="polite">
            <AnimatePresence mode="wait">
              {current && shown ? (
                <motion.div
                  key={`${current.scored.item.id}-${stats.explore + stats.exploit}`}
                  initial={{ opacity: 0, y: 16, rotate: -2 }}
                  animate={{ opacity: 1, y: 0, rotate: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="sticker bg-baby p-5"
                >
                  <div className="flex flex-wrap items-start gap-4">
                    <span className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl border-2 border-ink bg-cream text-5xl">{shown.item.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <span className={`chip ${current.mode === 'explore' ? 'bg-ink text-cream' : 'bg-hot text-cream'}`}>
                        {current.mode === 'explore' ? <><Dices size={14} /> Exploring — rank #{current.rank + 1} on purpose</> : <><Target size={14} /> Exploiting — current #1</>}
                      </span>
                      <p className="mt-2 font-display text-3xl font-black leading-tight">{shown.item.name}</p>
                      <p className="text-sm text-ink/70">
                        Match score <b>{Math.round(shown.score * 100)}%</b> · best fit on{' '}
                        {bestMatches.map((m) => FEATURES.find((f) => f.key === m.key)!.label.toLowerCase()).join(' & ')}
                      </p>
                      {shown.notes.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {shown.notes.map((n) => (
                            <li key={n} className="rounded-full bg-cream px-2 py-0.5 text-xs font-semibold">{n}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button onClick={() => vote('up')} disabled={!!voted} className="btn-cream !py-2" aria-label="I like this recommendation">
                      <ThumbsUp size={16} /> Love it
                    </button>
                    <button onClick={() => vote('down')} disabled={!!voted} className="btn-cream !py-2" aria-label="I don't like this recommendation">
                      <ThumbsDown size={16} /> Nope
                    </button>
                    <button onClick={() => setInviting((v) => !v)} aria-expanded={inviting} className="btn-hot !py-2">
                      <Send size={16} /> Invite {site.name} ♡
                    </button>
                    {voted && (
                      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-hand text-xl text-berry">
                        {voted === 'up'
                          ? current.mode === 'explore'
                            ? 'A hidden gem! Exploration paid off ✨'
                            : 'Noted. Score boosted for next time.'
                          : 'Got it. Pushing it down the list.'}
                      </motion.span>
                    )}
                  </div>
                  {inviting && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4 overflow-hidden border-t-2 border-dashed border-ink/20 pt-4">
                      <InviteForm
                        key={shown.item.id}
                        source="Tiny AI on Yiyi's Universe"
                        subject={`Let's do this: ${shown.item.name} ${shown.item.emoji}`}
                        message={`Hi ${site.name}! Your Tiny AI says we should do "${shown.item.name}" ${shown.item.emoji} together. I'm in. When are you free?`}
                      />
                    </motion.div>
                  )}
                  {stale && <p className="mt-3 text-sm font-semibold text-berry">Your inputs changed: the #1 pick is now {top.item.emoji} {top.item.name}. Ask again!</p>}
                </motion.div>
              ) : (
                <motion.div key="empty" className="rounded-2xl border-2 border-dashed border-ink/30 p-6 text-center text-ink/60">
                  <Cloud className="mx-auto mb-2 text-hot" /> The model knows everything Yiyi loves doing. Tell it about you, then hit the button to find our perfect plan.
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div>
            <div className="mb-2 flex items-end justify-between gap-2">
              <p className="font-display text-xl font-black">What the model sees (live ranking)</p>
              <p className="text-xs text-ink/50">similarity + context + your feedback</p>
            </div>
            <LayoutGroup>
              <ol className="space-y-1.5">
                {ranked.map((r, i) => (
                  <motion.li
                    layout
                    key={r.item.id}
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                    className={`flex items-center gap-3 rounded-xl border-2 px-3 py-1.5 text-sm ${
                      current?.scored.item.id === r.item.id ? 'border-ink bg-baby' : 'border-transparent bg-cream/80'
                    }`}
                  >
                    <span className="w-5 font-mono text-xs text-ink/50">{i + 1}</span>
                    <span className="w-6 text-lg" aria-hidden>{r.item.emoji}</span>
                    <span className="w-36 truncate font-semibold sm:w-56">{r.item.name}</span>
                    <span className="relative h-3 flex-1 overflow-hidden rounded-full border border-ink/30 bg-cream">
                      <motion.span
                        className={`absolute inset-y-0 left-0 rounded-full ${i === 0 ? 'bg-hot' : 'bg-berry/60'}`}
                        animate={{ width: `${r.score * 100}%` }}
                        transition={{ type: 'spring', stiffness: 200, damping: 30 }}
                      />
                    </span>
                    <span className="w-10 text-right font-mono text-xs">{Math.round(r.score * 100)}%</span>
                  </motion.li>
                ))}
              </ol>
            </LayoutGroup>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border-2 border-ink bg-hot p-4 text-cream">
              <p className="text-xs font-bold uppercase tracking-wider opacity-80">Exploit picks</p>
              <p className="font-display text-3xl font-black">{stats.exploit}</p>
              <p className="text-xs opacity-80">{stats.exploitLikes} liked</p>
            </div>
            <div className="rounded-2xl border-2 border-ink bg-ink p-4 text-cream">
              <p className="text-xs font-bold uppercase tracking-wider opacity-80">Explore picks</p>
              <p className="font-display text-3xl font-black">{stats.explore}</p>
              <p className="text-xs opacity-80">{stats.exploreLikes} liked</p>
            </div>
            <div className="rounded-2xl border-2 border-ink bg-cream p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-ink/60">Learned from you</p>
              {learned.length === 0 ? (
                <p className="text-sm text-ink/60">Nothing yet. Rate a pick!</p>
              ) : (
                <ul className="mt-1 flex flex-wrap gap-1">
                  {learned.map(([id, v]) => (
                    <li key={id} className={`rounded-full px-2 py-0.5 text-xs font-bold ${v > 0 ? 'bg-baby' : 'bg-ink/10 line-through'}`}>
                      {ITEMS.find((i) => i.id === id)!.emoji} {v > 0 ? '+' : ''}{Math.round(v * 100)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <details className="rounded-2xl border-2 border-ink bg-cream p-4 text-sm">
            <summary className="cursor-pointer font-bold">How does this work, in plain English? 🤓</summary>
            <div className="mt-3 space-y-2 text-ink/80">
              <p><b>Similarity:</b> every activity has the same four traits as you. The closer the numbers, the better the match.</p>
              <p><b>Context:</b> rain makes hikes less appealing and short afternoons rule out all-day plans. Real recommenders do this with time, location, device and more.</p>
              <p><b>Feedback:</b> your 👍 and 👎 nudge a per-item “bias”. That's the model learning your taste.</p>
              <p><b>Explore vs exploit:</b> always showing the #1 pick (exploiting) means you'll never discover anything new. With probability ε the model deliberately tries a lower-ranked option (exploring). Crank ε up and see how many hidden gems you find.</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
