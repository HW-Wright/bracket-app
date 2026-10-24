import type React from 'react'
import type { ReactNode } from 'react'

/**
 * LED news crawl, like a sports channel: a pinned badge on the left and items scrolling right to left.
 * Short feeds are repeated so one copy is always wider than the screen; two copies run end to end so the
 * loop is seamless (the track moves left by exactly one copy, see .ticker-track in index.css). Speed is
 * constant per character. Static under prefers-reduced-motion.
 */
const TONES = {
  orange: 'bg-orange text-navy-950',
  yellow: 'bg-yellow text-navy-950',
} as const

export default function Crawl({
  items,
  pinned,
  label,
  tone,
}: {
  items: string[]
  pinned?: ReactNode
  label: string
  /** Bar colour (option G6 "split": orange news on top, yellow results below). */
  tone: keyof typeof TONES
}) {
  const chars = items.join(' ● ').length + 3
  const reps = Math.max(1, Math.ceil(70 / chars))
  const feed = Array.from({ length: reps }, () => items).flat()
  const seconds = Math.round(chars * reps * 0.2)

  const copy = (hidden: boolean) => (
    <span aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {feed.map((item, i) => (
        <span key={i} className="flex items-center">
          {item}
          <span className="px-2.5 opacity-45" aria-hidden>
            ●
          </span>
        </span>
      ))}
    </span>
  )

  return (
    <div
      role="marquee"
      aria-label={`${label}: ${items.join('. ')}`}
      className={`flex h-[26px] items-stretch overflow-hidden font-mono text-[13px] font-semibold whitespace-nowrap uppercase ${TONES[tone]}`}
    >
      {pinned && <span className="relative z-[1] flex shrink-0 items-stretch">{pinned}</span>}
      <div className="flex min-w-0 flex-1 items-center overflow-hidden pl-2.5">
        <div className="ticker-track flex w-max" style={{ '--ticker-duration': `${seconds}s` } as React.CSSProperties}>
          {copy(false)}
          {copy(true)}
        </div>
      </div>
    </div>
  )
}
