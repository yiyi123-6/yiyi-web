const COLORS = ['#FF4FA3', '#FFD6EA', '#8B1E55', '#FFFDF8', '#21151D', '#FFB3D9']

/** Tiny dependency-free confetti burst rendered on a throwaway canvas. */
export function confetti({ x = 0.5, y = 0.5, count = 140 }: { x?: number; y?: number; count?: number } = {}) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const canvas = document.createElement('canvas')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '9999',
  })
  canvas.setAttribute('aria-hidden', 'true')
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)

  const ox = x * window.innerWidth
  const oy = y * window.innerHeight
  const parts = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = 4 + Math.random() * 9
    return {
      x: ox, y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6,
      size: 6 + Math.random() * 8,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      heart: Math.random() < 0.25,
    }
  })

  let frame = 0
  const tick = () => {
    frame++
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    for (const p of parts) {
      p.vy += 0.28
      p.vx *= 0.985
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      ctx.globalAlpha = Math.max(0, 1 - frame / 160)
      if (p.heart) {
        ctx.font = `${p.size * 1.6}px sans-serif`
        ctx.fillText('♥', -p.size / 2, p.size / 2)
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      }
      ctx.restore()
    }
    if (frame < 160) requestAnimationFrame(tick)
    else canvas.remove()
  }
  requestAnimationFrame(tick)
}

export function confettiFrom(el: Element | null) {
  if (!el) return confetti()
  const r = el.getBoundingClientRect()
  confetti({ x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight })
}
