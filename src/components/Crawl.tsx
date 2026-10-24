import type React from 'react'
import type { ReactNode } from 'react'

/**
 * LED news crawl, like a sports channel: a pinned badge on the left and items scrolling right to left.
 * Short feeds are repeated so one copy is always wider than the screen; two copies run end to end so the
 * loop is seamless (the track moves left by exactly one copy, see .ticker-track in index.css). Speed is
 * constant per character. Static under prefers-reduced-motion.
 */
export default function Crawl({ items, pinned, label }: { items: string[]; pinned?: ReactNode; label: string }) {
  const chars = items.join(' ● ').length + 3
  const reps = Math.max(1, Math.ceil(70 / chars))
  const feed = Array.from({ length: reps }, () => items).flat()
  const seconds = Math.round(chars * reps * 0.2)

  const copy = (hidden: boolean) => (
    <span aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {feed.map((item, i) => (
        <span key={i} className="flex items-center">
          {item}
          <span className="px-2.5 text-line" aria-hidden>
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
      className="flex h-[26px] items-stretch overflow-hidden bg-navy-900 font-crawl text-[13px] whitespace-nowrap text-amber uppercase"
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
