import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

const LINES = [
  'Hi! Welcome to my universe ♡',
  "Pick a portal — I'll wait. (I'm doing curls.)",
  'Fun fact: this dumbbell is 100% pink.',
  'p < 0.05 that you’ll love it here.',
  'Okay, okay — one more rep!',
]

/** Illustrated Yiyi: sweatband, ponytail, pink hoodie, backpack straps and a mini dumbbell mid-curl. */
export function Avatar({ className = '' }: { className?: string }) {
  const reduce = useReducedMotion()
  const [line, setLine] = useState(0)
  const [talking, setTalking] = useState(false)

  const say = () => {
    setTalking(true)
    setLine((l) => (talking ? (l + 1) % LINES.length : l))
  }

  const loop = (duration: number, extra: object = {}) =>
    reduce ? undefined : { duration, repeat: Infinity, ease: 'easeInOut' as const, ...extra }

  return (
    <div className={`relative ${className}`}>
      <AnimatePresence>
        {talking && (
          <motion.div
            key={line}
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            className="sticker absolute -top-4 left-1/2 z-10 w-max max-w-[16rem] -translate-x-1/2 -translate-y-full bg-cream px-4 py-2 text-center text-sm font-semibold"
            role="status"
          >
            {LINES[line]}
            <span className="absolute -bottom-[9px] left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-ink bg-cream" />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={say}
        aria-label="Say hi to Yiyi's avatar"
        className="block w-full cursor-pointer rounded-[2rem]"
        whileHover={reduce ? undefined : { rotate: -2, scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
      >
        <motion.svg
          viewBox="0 0 260 320"
          className="w-full drop-shadow-[6px_6px_0_rgba(33,21,29,1)]"
          animate={reduce ? undefined : { y: [0, -6, 0] }}
          transition={loop(4)}
          aria-hidden
        >
          {/* ponytail */}
          <motion.g style={{ originX: '190px', originY: '95px' }} animate={reduce ? undefined : { rotate: [-6, 8, -6] }} transition={loop(2.2)}>
            <path d="M182 92 C230 80 238 150 214 186 C228 140 206 112 178 112 Z" fill="#2B1A24" stroke="#21151D" strokeWidth="3" />
          </motion.g>
          <circle cx="186" cy="96" r="9" fill="#FF4FA3" stroke="#21151D" strokeWidth="3" />

          {/* body / hoodie */}
          <path d="M42 320 C42 246 76 206 130 206 C184 206 218 246 218 320 Z" fill="#FF4FA3" stroke="#21151D" strokeWidth="3" />
          <path d="M104 210 Q130 236 156 210" fill="none" stroke="#21151D" strokeWidth="3" />
          <path d="M118 232 L116 262 M142 232 L144 262" stroke="#FFFDF8" strokeWidth="3" strokeLinecap="round" />
          {/* backpack straps */}
          <path d="M80 222 C74 250 72 286 74 320" stroke="#8B1E55" strokeWidth="14" fill="none" />
          {/* chest badge */}
          <g transform="translate(150 266)">
            <circle r="15" fill="#FFFDF8" stroke="#21151D" strokeWidth="3" />
            <path d="M-9 6 L-2 -5 L2 0 L5 -4 L10 6 Z" fill="#8B1E55" />
          </g>

          {/* neck + head */}
          <rect x="116" y="170" width="28" height="40" rx="10" fill="#F3C4A4" stroke="#21151D" strokeWidth="3" />
          <circle cx="130" cy="126" r="60" fill="#F7CFB2" stroke="#21151D" strokeWidth="3" />
          {/* hair top */}
          <path
            d="M70 124 C66 70 104 56 132 58 C170 58 196 82 190 124 C176 98 150 88 124 92 C100 94 82 104 70 124 Z"
            fill="#2B1A24"
            stroke="#21151D"
            strokeWidth="3"
          />
          {/* sweatband */}
          <path d="M72 108 C100 86 162 84 189 106 L187 120 C160 100 102 100 74 122 Z" fill="#FFD6EA" stroke="#21151D" strokeWidth="3" />
          <path d="M126 92 l3 6 6 1 -5 4 1 6 -5 -3 -5 3 1 -6 -5 -4 6 -1 Z" fill="#FF4FA3" />

          {/* eyes (blink) */}
          <motion.g
            style={{ originY: '138px' }}
            animate={reduce ? undefined : { scaleY: [1, 1, 0.1, 1] }}
            transition={loop(4.5, { times: [0, 0.9, 0.95, 1], ease: 'linear' })}
          >
            <ellipse cx="108" cy="138" rx="6" ry="8" fill="#21151D" />
            <ellipse cx="152" cy="138" rx="6" ry="8" fill="#21151D" />
            <circle cx="110" cy="135" r="2" fill="#FFFDF8" />
            <circle cx="154" cy="135" r="2" fill="#FFFDF8" />
          </motion.g>
          <path d="M98 124 q10 -6 20 0 M142 124 q10 -6 20 0" stroke="#21151D" strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx="94" cy="156" r="9" fill="#FF4FA3" opacity=".45" />
          <circle cx="166" cy="156" r="9" fill="#FF4FA3" opacity=".45" />
          <path d="M116 158 Q130 174 144 158" stroke="#21151D" strokeWidth="3.5" fill="#FFFDF8" strokeLinecap="round" />

          {/* curling arm + dumbbell */}
          <motion.g
            style={{ originX: '196px', originY: '240px' }}
            animate={reduce ? undefined : { rotate: [10, -28, 10] }}
            transition={loop(1.6)}
          >
            <path d="M190 236 C214 236 234 220 236 196" stroke="#21151D" strokeWidth="25" fill="none" strokeLinecap="round" />
            <path d="M190 236 C214 236 234 220 236 196" stroke="#FF4FA3" strokeWidth="19" fill="none" strokeLinecap="round" />
            <circle cx="236" cy="190" r="11" fill="#F7CFB2" stroke="#21151D" strokeWidth="3" />
            <g transform="translate(236 180) rotate(-12)">
              <rect x="-26" y="-3" width="52" height="7" rx="3" fill="#21151D" />
              <rect x="-34" y="-13" width="14" height="27" rx="5" fill="#8B1E55" stroke="#21151D" strokeWidth="3" />
              <rect x="20" y="-13" width="14" height="27" rx="5" fill="#8B1E55" stroke="#21151D" strokeWidth="3" />
            </g>
          </motion.g>
        </motion.svg>
      </motion.button>
    </div>
  )
}
