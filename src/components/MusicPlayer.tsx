import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Music, Pause, Play } from 'lucide-react'
import { music } from '../data/content'

type YTPlayer = { playVideo(): void; pauseVideo(): void; setVolume(v: number): void; getPlayerState(): number }
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: object) => YTPlayer; PlayerState: { PLAYING: number } }
    onYouTubeIframeAPIReady?: () => void
  }
}

const OFF_KEY = 'yiyis-universe:music-off'
export const MUSIC_PAUSE = 'yiyi:music-pause'
export const MUSIC_RESUME = 'yiyi:music-resume'

function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  return new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve() }
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      s.async = true
      document.head.appendChild(s)
    }
  })
}

/**
 * Background theme song. Browsers block sound until the visitor interacts with the page,
 * so playback starts on the first tap/click/keypress (unless they turned the music off before).
 */
export function MusicPlayer() {
  const reduce = useReducedMotion()
  const host = useRef<HTMLDivElement>(null)
  const player = useRef<YTPlayer | null>(null)
  const wantPlay = useRef(false)
  const pausedByOther = useRef(false)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [off, setOff] = useState(() => {
    try { return localStorage.getItem(OFF_KEY) === '1' } catch { return false }
  })
  const [hint, setHint] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadApi().then(() => {
      if (cancelled || !host.current || !window.YT) return
      player.current = new window.YT.Player(host.current, {
        videoId: music.youtubeId,
        width: 120,
        height: 68,
        playerVars: { autoplay: 0, controls: 0, loop: 1, playlist: music.youtubeId, playsinline: 1, rel: 0, disablekb: 1, modestbranding: 1 },
        events: {
          onReady: () => {
            setReady(true)
            player.current?.setVolume(music.volume)
            if (wantPlay.current) player.current?.playVideo()
          },
          onStateChange: (e: { data: number }) => setPlaying(e.data === window.YT!.PlayerState.PLAYING),
        },
      })
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (off) return
    setHint(true)
    const t = window.setTimeout(() => setHint(false), 7000)
    const start = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-music-control]')) return
      wantPlay.current = true
      player.current?.playVideo()
      setHint(false)
      cleanup()
    }
    const events = ['pointerdown', 'keydown', 'touchstart'] as const
    const cleanup = () => events.forEach((ev) => window.removeEventListener(ev, start, true))
    events.forEach((ev) => window.addEventListener(ev, start, { capture: true, passive: true }))
    return () => { cleanup(); window.clearTimeout(t) }
  }, [off])

  useEffect(() => {
    const pause = () => {
      if (player.current && (wantPlay.current || player.current.getPlayerState?.() === window.YT?.PlayerState.PLAYING)) {
        pausedByOther.current = true
        player.current.pauseVideo()
      }
    }
    const resume = () => {
      if (pausedByOther.current) { pausedByOther.current = false; player.current?.playVideo() }
    }
    window.addEventListener(MUSIC_PAUSE, pause)
    window.addEventListener(MUSIC_RESUME, resume)
    return () => { window.removeEventListener(MUSIC_PAUSE, pause); window.removeEventListener(MUSIC_RESUME, resume) }
  }, [])

  const toggle = () => {
    if (playing) {
      wantPlay.current = false
      pausedByOther.current = false
      player.current?.pauseVideo()
      setOff(true)
      try { localStorage.setItem(OFF_KEY, '1') } catch { /* ignore */ }
    } else {
      wantPlay.current = true
      player.current?.playVideo()
      setOff(false)
      try { localStorage.removeItem(OFF_KEY) } catch { /* ignore */ }
    }
  }

  return (
    <div data-music-control className="fixed bottom-4 right-4 z-[80] flex items-end gap-2 print:hidden">
      <AnimatePresence>
        {hint && !playing && (
          <motion.p
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="sticker mb-1 hidden bg-cream px-3 py-1.5 font-hand text-lg leading-tight sm:block"
          >
            tap anywhere for my theme song ♫
          </motion.p>
        )}
      </AnimatePresence>
      <div className="sticker flex items-center gap-2 bg-ink py-1.5 pl-1.5 pr-2 text-cream">
        <motion.div
          className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-cream"
          animate={playing && !reduce ? { rotate: 360 } : { rotate: 0 }}
          transition={playing && !reduce ? { repeat: Infinity, duration: 4, ease: 'linear' } : { duration: 0.3 }}
          aria-hidden
        >
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[68px] w-[120px] -translate-x-1/2 -translate-y-1/2">
            <div ref={host} />
          </div>
          <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink bg-hot" />
        </motion.div>
        <div className="hidden min-w-0 leading-tight sm:block">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-baby">
            <Music size={10} /> {playing ? 'now playing' : 'theme song'}
          </p>
          <p className="max-w-[10rem] truncate text-sm font-semibold">{music.title}</p>
          <p className="text-xs text-cream/60">{music.artist}</p>
        </div>
        <button
          onClick={toggle}
          disabled={!ready}
          aria-label={playing ? `Pause ${music.title}` : `Play ${music.title} by ${music.artist}`}
          aria-pressed={playing}
          className="grid h-9 w-9 place-items-center rounded-full bg-hot text-cream transition hover:scale-105 disabled:opacity-50"
        >
          {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
      </div>
    </div>
  )
}
