import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Dices, Menu, X } from 'lucide-react'
import { WORLDS, href, navigate, type Route } from '../lib/router'
import { site } from '../data/content'

const LINKS: { route: Route; label: string; emoji: string }[] = [
  { route: 'brain', label: 'Brain', emoji: '🧠' },
  { route: 'gym', label: 'Gym', emoji: '💪' },
  { route: 'mountains', label: 'Mountains', emoji: '🏔️' },
  { route: 'founder', label: 'Founder', emoji: '🚀' },
  { route: 'about', label: 'About', emoji: '🎮' },
  { route: 'connect', label: 'Say hi', emoji: '💌' },
]

export function feelingLucky(current: Route) {
  const pool = WORLDS.filter((w) => w !== current)
  navigate(pool[Math.floor(Math.random() * pool.length)])
}

export function Nav({ route }: { route: Route }) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => setOpen(false), [route])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`sticky top-0 z-[70] transition-colors ${scrolled ? 'bg-cream/90 backdrop-blur-sm border-b-2 border-ink' : 'bg-transparent'}`}>
      <nav aria-label="Main" className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-8">
        <a href={href('home')} className="group flex items-center gap-2 font-display text-xl font-black tracking-tight md:text-2xl">
          <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-ink bg-hot text-cream transition-transform group-hover:rotate-12">
            ♡
          </span>
          <span>
            {site.title}
            <span className="text-hot"> ♡</span>
          </span>
        </a>

        <ul className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.route}>
              <a
                href={href(l.route)}
                aria-current={route === l.route ? 'page' : undefined}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition hover:bg-baby ${
                  route === l.route ? 'bg-ink text-cream hover:bg-ink' : ''
                }`}
              >
                <span aria-hidden className="mr-1">{l.emoji}</span>
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <button onClick={() => feelingLucky(route)} className="btn-hot hidden !px-4 !py-2 text-sm sm:inline-flex">
            <Dices size={16} /> I'm Feeling Lucky ♡
          </button>
          <button
            className="btn-cream !p-2 lg:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b-2 border-ink bg-cream lg:hidden"
          >
            <ul className="grid grid-cols-2 gap-2 p-4">
              {LINKS.map((l) => (
                <li key={l.route}>
                  <a href={href(l.route)} className="sticker flex items-center gap-2 px-4 py-3 font-semibold">
                    <span aria-hidden>{l.emoji}</span> {l.label}
                  </a>
                </li>
              ))}
              <li className="col-span-2">
                <button onClick={() => feelingLucky(route)} className="btn-hot w-full">
                  <Dices size={16} /> I'm Feeling Lucky ♡
                </button>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
