import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { WORLDS, type World } from './router'

type Toast = { id: number; text: string; emoji?: string }

type Universe = {
  visited: World[]
  markVisited: (w: World) => void
  resetBadges: () => void
  disco: boolean
  toggleDisco: () => void
  dumbbellCursor: boolean
  summonDumbbell: () => void
  secretsFound: string[]
  findSecret: (id: string, text: string, emoji?: string) => void
  toasts: Toast[]
  toast: (text: string, emoji?: string) => void
}

const Ctx = createContext<Universe | null>(null)
const KEY = 'yiyis-universe:v1'

type Saved = { visited: World[]; secrets: string[] }

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return {
      visited: Array.isArray(raw.visited) ? raw.visited.filter((w: string) => (WORLDS as readonly string[]).includes(w)) : [],
      secrets: Array.isArray(raw.secrets) ? raw.secrets : [],
    }
  } catch {
    return { visited: [], secrets: [] }
  }
}

export function UniverseProvider({ children }: { children: ReactNode }) {
  const initial = useRef(load()).current
  const [visited, setVisited] = useState<World[]>(initial.visited)
  const [secretsFound, setSecrets] = useState<string[]>(initial.secrets)
  const [disco, setDisco] = useState(false)
  const [dumbbellCursor, setDumbbell] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const discoTimer = useRef<number>(undefined)
  const dumbbellTimer = useRef<number>(undefined)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ visited, secrets: secretsFound }))
    } catch {
      /* private mode — progress just won't persist */
    }
  }, [visited, secretsFound])

  const toast = useCallback((text: string, emoji?: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-2), { id, text, emoji }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])

  const visitedRef = useRef(visited)
  visitedRef.current = visited
  const secretsRef = useRef(secretsFound)
  secretsRef.current = secretsFound

  const markVisited = useCallback(
    (w: World) => {
      if (visitedRef.current.includes(w)) return
      const next = [...visitedRef.current, w]
      visitedRef.current = next
      setVisited(next)
      toast(next.length === WORLDS.length ? 'All four badges! You officially know me. ♡' : `Badge unlocked: ${BADGE_LABEL[w]}`, BADGE_EMOJI[w])
    },
    [toast],
  )

  const findSecret = useCallback(
    (id: string, text: string, emoji = '🤫') => {
      if (!secretsRef.current.includes(id)) {
        secretsRef.current = [...secretsRef.current, id]
        setSecrets(secretsRef.current)
      }
      toast(text, emoji)
    },
    [toast],
  )

  const toggleDisco = useCallback(() => {
    setDisco((d) => {
      window.clearTimeout(discoTimer.current)
      if (!d) discoTimer.current = window.setTimeout(() => setDisco(false), 10000)
      return !d
    })
  }, [])

  const summonDumbbell = useCallback(() => {
    window.clearTimeout(dumbbellTimer.current)
    setDumbbell(true)
    dumbbellTimer.current = window.setTimeout(() => setDumbbell(false), 6000)
  }, [])

  const value = useMemo<Universe>(
    () => ({
      visited, markVisited, resetBadges: () => setVisited([]),
      disco, toggleDisco, dumbbellCursor, summonDumbbell,
      secretsFound, findSecret, toasts, toast,
    }),
    [visited, markVisited, disco, toggleDisco, dumbbellCursor, summonDumbbell, secretsFound, findSecret, toasts, toast],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useUniverse() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useUniverse must be used inside <UniverseProvider>')
  return ctx
}

export const BADGE_LABEL: Record<World, string> = {
  brain: 'Big Brain',
  gym: 'Iron Heart',
  mountains: 'Summit Seeker',
  founder: 'Founder Mode',
}
export const BADGE_EMOJI: Record<World, string> = {
  brain: '🧠',
  gym: '💪',
  mountains: '🏔️',
  founder: '🚀',
}

export const TOTAL_SECRETS = 5
