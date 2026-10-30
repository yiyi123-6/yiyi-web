import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react'
import { useUniverse } from '../lib/universe'

/** A tiny pink blob that trails the pointer. Turns into a dumbbell when summoned. */
export function CursorCompanion() {
  const reduce = useReducedMotion()
  const { dumbbellCursor } = useUniverse()
  const [fine, setFine] = useState(false)
  const [visible, setVisible] = useState(false)
  const x = useMotionValue(-100)
  const y = useMotionValue(-100)
  const sx = useSpring(x, { stiffness: 180, damping: 18, mass: 0.6 })
  const sy = useSpring(y, { stiffness: 180, damping: 18, mass: 0.6 })

  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)')
    setFine(mq.matches)
    const onMq = () => setFine(mq.matches)
    mq.addEventListener('change', onMq)
    const onMove = (e: PointerEvent) => {
      x.set(e.clientX + 18)
      y.set(e.clientY + 18)
      setVisible(true)
    }
    const onLeave = () => setVisible(false)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      mq.removeEventListener('change', onMq)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [x, y])

  if (reduce && !dumbbellCursor) return null
  if (!fine && !dumbbellCursor) return null

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[90]"
      style={{ x: sx, y: sy, opacity: visible || dumbbellCursor ? 1 : 0 }}
    >
      <AnimatePresence mode="wait">
        {dumbbellCursor ? (
          <motion.svg
            key="db"
            width="56"
            height="28"
            viewBox="0 0 56 28"
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: [0, -15, 15, 0] }}
            exit={{ scale: 0 }}
            transition={{ rotate: { repeat: Infinity, duration: 0.8 } }}
          >
            <rect x="12" y="11" width="32" height="6" rx="3" fill="#21151D" />
            <rect x="2" y="2" width="12" height="24" rx="4" fill="#FF4FA3" stroke="#21151D" strokeWidth="2.5" />
            <rect x="42" y="2" width="12" height="24" rx="4" fill="#FF4FA3" stroke="#21151D" strokeWidth="2.5" />
          </motion.svg>
        ) : (
          <motion.svg
            key="blob"
            width="30"
            height="28"
            viewBox="0 0 30 28"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <path
              d="M15 26 C4 18 1 12 1 8 A6.8 6.8 0 0 1 15 5 A6.8 6.8 0 0 1 29 8 C29 12 26 18 15 26 Z"
              fill="#FF4FA3"
              stroke="#21151D"
              strokeWidth="2"
            />
            <circle cx="11" cy="11" r="1.6" fill="#21151D" />
            <circle cx="19" cy="11" r="1.6" fill="#21151D" />
            <path d="M12.5 15 Q15 17 17.5 15" stroke="#21151D" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </motion.svg>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
