import { Camera } from 'lucide-react'
import { asset } from '../lib/asset'
import type { Photo as PhotoT } from '../data/content'

const SCENES = [
  // mountains
  <g key="m">
    <circle cx="150" cy="38" r="16" fill="#FFFDF8" opacity=".9" />
    <path d="M0 120 L55 55 L85 85 L125 35 L200 120 Z" fill="#8B1E55" />
    <path d="M110 52 L125 35 L140 55 L130 50 L122 58 Z" fill="#FFFDF8" />
    <path d="M0 120 L40 90 L80 110 L140 80 L200 105 L200 120 Z" fill="#FF4FA3" />
  </g>,
  // sunrise
  <g key="s">
    <circle cx="100" cy="95" r="34" fill="#FFFDF8" opacity=".85" />
    <path d="M0 120 L0 95 Q50 70 100 92 T200 85 L200 120 Z" fill="#8B1E55" />
    <path d="M0 120 L0 108 Q60 95 120 108 T200 104 L200 120 Z" fill="#FF4FA3" />
  </g>,
  // lake
  <g key="l">
    <path d="M0 80 L45 30 L80 62 L120 22 L200 80 Z" fill="#8B1E55" />
    <rect x="0" y="80" width="200" height="40" fill="#FF4FA3" opacity=".7" />
    <path d="M20 95 H70 M110 102 H170 M50 110 H100" stroke="#FFFDF8" strokeWidth="3" strokeLinecap="round" opacity=".7" />
  </g>,
  // sketch / desk
  <g key="d">
    <rect x="40" y="25" width="120" height="78" rx="8" fill="#FFFDF8" stroke="#21151D" strokeWidth="3" />
    <path d="M55 85 L80 60 L100 75 L125 45 L145 60" stroke="#FF4FA3" strokeWidth="4" fill="none" strokeLinecap="round" />
    <circle cx="125" cy="45" r="5" fill="#8B1E55" />
  </g>,
]

/** Lazy-loading image with an illustrated pink placeholder when no `src` is set yet. `hint` (dev only) says where to drop a photo. */
export function Photo({ photo, seed = 0, className = '', hint }: { photo: PhotoT; seed?: number; className?: string; hint?: string }) {
  if (photo.src) {
    return (
      <img
        src={asset(photo.src)}
        alt={photo.alt}
        loading="lazy"
        decoding="async"
        className={`h-full w-full object-cover ${className}`}
      />
    )
  }
  return (
    <div
      role="img"
      aria-label={`${photo.alt} (photo placeholder)`}
      className={`relative h-full w-full overflow-hidden bg-gradient-to-br from-baby via-blush to-baby ${className}`}
    >
      <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full" aria-hidden>
        {SCENES[seed % SCENES.length]}
      </svg>
      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-cream/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-berry">
        <Camera size={11} /> your photo
      </span>
      {hint && (
        <span className="absolute inset-x-2 bottom-2 rounded-lg bg-ink/85 px-2 py-1 text-center font-mono text-[11px] text-cream">
          drop photos in {hint}
        </span>
      )}
    </div>
  )
}
