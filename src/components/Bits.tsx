import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft } from 'lucide-react'
import { href } from '../lib/router'

export function Marquee({ items, className = '' }: { items: string[]; className?: string }) {
  const row = [...items, ...items]
  return (
    <div className={`overflow-hidden border-y-2 border-ink py-3 ${className}`} aria-hidden>
      <div className="flex w-max animate-marquee gap-8 whitespace-nowrap font-display text-2xl font-black italic md:text-3xl">
        {row.map((t, i) => (
          <span key={i} className="flex items-center gap-8">
            {t} <span className="text-hot not-italic">✦</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function BackHome({ className = '' }: { className?: string }) {
  return (
    <a href={href('home')} className={`btn-cream !px-4 !py-2 text-sm ${className}`}>
      <ArrowLeft size={16} /> Back to the universe
    </a>
  )
}

export function SectionTitle({
  eyebrow,
  title,
  children,
  className = '',
}: {
  eyebrow?: string
  title: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5 }}
      className={`mb-10 max-w-3xl ${className}`}
    >
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="font-display text-4xl font-black leading-[0.95] tracking-tight md:text-6xl">{title}</h2>
      {children && <div className="mt-4 text-lg text-ink/75">{children}</div>}
    </motion.div>
  )
}

export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
