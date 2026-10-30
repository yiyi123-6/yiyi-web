import { motion } from 'motion/react'
import { ArrowUpRight, FlaskConical, Medal } from 'lucide-react'
import { BackHome, Marquee, Reveal, SectionTitle } from '../../components/Bits'
import { GithubIcon } from '../../components/BrandIcons'
import { Editable } from '../../components/Editable'
import { brain, links } from '../../data/content'
import { TinyAI } from './TinyAI'

function LabHero() {
  return (
    <section className="grid-paper relative overflow-hidden border-b-2 border-ink bg-blush">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-8 md:px-8 lg:grid-cols-[1.3fr_0.7fr]">
        <div>
          <BackHome />
          <p className="eyebrow mt-10">world 01 · the lab</p>
          <h1 className="font-display text-[clamp(3rem,9vw,8rem)] font-black leading-[0.85] tracking-[-0.04em]">
            Explore <br />
            my <span className="italic text-hot">brain</span>
            <span className="text-berry">.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink/80">{brain.intro}</p>
          <p className="mt-4 inline-flex items-center gap-2 font-semibold">
            <FlaskConical size={18} className="text-hot" /> <Editable text={brain.role} />
          </p>
        </div>
        <div className="relative hidden lg:block" aria-hidden>
          <motion.div
            className="sticker absolute right-4 top-8 w-64 rotate-3 bg-cream p-4 font-mono text-xs leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <p className="text-ink/50"># experiment_log.py</p>
            <p><span className="text-hot">import</span> curiosity <span className="text-hot">as</span> cur</p>
            <p>model = cur.fit(chaos)</p>
            <p>model.predict(<span className="text-berry">"next adventure"</span>)</p>
            <p className="text-ink/50">&gt;&gt;&gt; 'mountains' (p=0.97)</p>
          </motion.div>
          <motion.div
            className="sticker absolute bottom-8 left-0 w-56 -rotate-6 bg-hot p-4 text-cream"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <p className="font-hand text-2xl leading-tight">“what decision will this change?” — me, every kickoff</p>
          </motion.div>
          <svg viewBox="0 0 200 120" className="absolute bottom-36 right-0 w-60">
            <path d="M5 110 Q 50 105 70 80 T 130 40 T 195 8" fill="none" stroke="#FF4FA3" strokeWidth="4" strokeDasharray="400" strokeDashoffset="400" className="animate-draw" />
            {[[5, 110], [70, 80], [130, 40], [195, 8]].map(([x, y]) => (
              <circle key={x} cx={x} cy={y} r="5" fill="#21151D" />
            ))}
          </svg>
        </div>
      </div>
    </section>
  )
}

export function Brain() {
  return (
    <>
      <LabHero />
      <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <SectionTitle eyebrow="what I nerd out about" title={<>Six things I'm <span className="italic text-hot">annoyingly</span> good at caring about.</>} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {brain.focusAreas.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.05}>
              <motion.div
                whileHover={{ rotate: i % 2 ? 1.5 : -1.5, y: -4 }}
                className={`sticker h-full p-6 ${i === 2 ? 'bg-hot text-cream' : i === 4 ? 'bg-ink text-cream' : 'bg-cream'}`}
              >
                <p className="text-4xl">{f.emoji}</p>
                <p className="mt-3 font-display text-2xl font-black leading-tight">{f.title}</p>
                <p className="mt-2 opacity-80">{f.blurb}</p>
                <p className="mt-4 font-mono text-xs opacity-50">specimen #{String(i + 1).padStart(3, '0')}</p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="tiny-ai" className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-20 md:px-8">
        <SectionTitle eyebrow="interactive experiment" title={<>What should we <span className="italic text-hot">do together?</span></>}>
          Ask my tiny AI. It's a real (if very small) recommendation system that runs entirely in your browser and knows everything I love doing: hiking, snowboarding, lifting, boxing, data and startups. Tell it about you, and it'll match us with the perfect plan. Rate the pick to teach it, then send me the invite.
        </SectionTitle>
        <Reveal>
          <TinyAI />
        </Reveal>
      </section>

      <Marquee className="bg-baby" items={['Machine learning', 'A/B testing', 'Recsys', 'Causal inference', 'Applied AI', 'Product thinking']} />

      <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <SectionTitle eyebrow="selected work" title="Projects in the lab.">
          Real projects go here. Bracketed text is a placeholder until I fill it in.
        </SectionTitle>
        <div className="grid gap-6 md:grid-cols-3">
          {brain.projects.map((p, i) => (
            <Reveal key={i} delay={i * 0.08}>
              <article className={`sticker flex h-full flex-col bg-cream p-6 ${i === 1 ? 'md:translate-y-8' : ''}`}>
                <p className="font-mono text-xs text-ink/50">PROJECT_{String(i + 1).padStart(2, '0')}</p>
                <h3 className="mt-2 font-display text-2xl font-black leading-tight"><Editable text={p.title} /></h3>
                <p className="mt-3 flex-1 text-ink/75"><Editable text={p.blurb} /></p>
                <p className="mt-4 rounded-xl bg-blush p-3 text-sm font-semibold"><Editable text={p.impact} /></p>
                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {p.tags.map((t) => (
                    <li key={t} className="chip !py-0.5 text-xs"><Editable text={t} /></li>
                  ))}
                </ul>
                {p.link && (
                  <a href={p.link} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 font-semibold underline underline-offset-4">
                    View project <ArrowUpRight size={16} />
                  </a>
                )}
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 pb-24 md:grid-cols-[1.3fr_1fr] md:px-8">
        <Reveal>
          <div className="sticker h-full bg-baby p-6 md:p-8">
            <p className="eyebrow">toolbox</p>
            <p className="font-display text-3xl font-black">Skills & superpowers</p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {brain.skills.map((s, i) => (
                <motion.li
                  key={s}
                  whileHover={{ scale: 1.08, rotate: i % 2 ? 3 : -3 }}
                  className={`rounded-full border-2 border-ink px-4 py-2 font-semibold ${i % 4 === 0 ? 'bg-hot text-cream' : i % 4 === 2 ? 'bg-ink text-cream' : 'bg-cream'}`}
                >
                  {s}
                </motion.li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="sticker h-full bg-cream p-6 md:p-8">
            <p className="eyebrow">trophy shelf</p>
            <p className="font-display text-3xl font-black">Achievements</p>
            <ul className="mt-5 space-y-3">
              {brain.achievements.map((a, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Medal className="mt-0.5 shrink-0 text-hot" size={20} />
                  <Editable text={a} />
                </li>
              ))}
            </ul>
            <a href={links.github} target="_blank" rel="noreferrer" className="btn-ink mt-6">
              <GithubIcon size={18} /> See my GitHub
            </a>
          </div>
        </Reveal>
      </section>
    </>
  )
}
