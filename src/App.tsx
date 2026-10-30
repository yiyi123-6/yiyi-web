import { useEffect, useRef, type ComponentType } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { X } from 'lucide-react'
import { UniverseProvider, useUniverse } from './lib/universe'
import { WORLDS, useHashRoute, type Route, type World } from './lib/router'
import { site } from './data/content'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { CursorCompanion } from './components/CursorCompanion'
import { BadgeWidget, Toasts } from './components/BadgeWidget'
import { MusicPlayer } from './components/MusicPlayer'
import { Home } from './sections/Home'
import { About } from './sections/About'
import { Connect } from './sections/Connect'
import { Brain } from './sections/brain/Brain'
import { Gym } from './sections/gym/Gym'
import { Mountains } from './sections/mountains/Mountains'
import { Founder } from './sections/founder/Founder'

const PAGES: Record<Route, ComponentType> = {
  home: Home,
  brain: Brain,
  gym: Gym,
  mountains: Mountains,
  founder: Founder,
  about: About,
  connect: Connect,
}

const TITLES: Record<Route, string> = {
  home: `${site.title} ♡ — ${site.tagline.replace(/\.$/, '')}`,
  brain: `The Brain 🧠 · ${site.title}`,
  gym: `The Gym 💪 · ${site.title}`,
  mountains: `The Mountains 🏔️ · ${site.title}`,
  founder: `Founder Mode 🚀 · ${site.title}`,
  about: `About ${site.name} · ${site.title}`,
  connect: `Connect ♡ · ${site.title}`,
}

const isWorld = (r: Route): r is World => (WORLDS as readonly string[]).includes(r)

function useDiscoTrigger() {
  const { toggleDisco, findSecret } = useUniverse()
  const buffer = useRef('')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return
      buffer.current = (buffer.current + e.key.toLowerCase()).slice(-5)
      if (buffer.current === 'disco') {
        buffer.current = ''
        toggleDisco()
        findSecret('disco', 'You found DISCO PINK MODE! 🪩', '🪩')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleDisco, findSecret])
}

function Shell() {
  const route = useHashRoute()
  const { markVisited, disco, toggleDisco } = useUniverse()
  useDiscoTrigger()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    document.title = TITLES[route]
    if (isWorld(route)) markVisited(route)
  }, [route, markVisited])

  const Page = PAGES[route]

  return (
    <>
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault()
          const main = document.getElementById('main')
          main?.focus()
          main?.scrollIntoView()
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-cream"
      >
        Skip to content
      </a>

      <AnimatePresence>
        {disco && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            role="status"
            className="fixed bottom-20 left-1/2 md:bottom-6 z-[90] flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-5 py-2 font-display text-sm font-black tracking-widest text-cream shadow-lg"
          >
            🪩 DISCO PINK MODE 🪩
            <button
              type="button"
              onClick={toggleDisco}
              aria-label="Turn off disco mode"
              className="rounded-full p-1 hover:bg-cream/20"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`min-h-screen overflow-x-clip ${disco ? 'disco-mode' : ''}`}>
        <Nav route={route} />
        <main id="main" tabIndex={-1} className="outline-none">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={route}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <Page />
            </motion.div>
          </AnimatePresence>
        </main>
        <Footer />
      </div>
      <CursorCompanion />
      <BadgeWidget />
      <MusicPlayer />
      <Toasts />
    </>
  )
}

export default function App() {
  return (
    <UniverseProvider>
      <MotionConfig reducedMotion="user">
        <Shell />
      </MotionConfig>
    </UniverseProvider>
  )
}
