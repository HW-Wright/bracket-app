import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'border-orange bg-orange font-display font-extrabold italic uppercase text-navy-950 hover:bg-yellow hover:border-yellow',
    ghost: 'border-line bg-navy-800 font-bold uppercase tracking-wider text-white hover:border-orange',
    danger: 'border-danger/70 bg-navy-800 font-bold uppercase tracking-wider text-danger hover:border-danger',
  }[variant]
  return (
    <button
      className={`min-h-11 border-2 px-4 text-base transition-colors disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  )
}

export function TextField({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-caps">{label}</span>
      <input
        className="min-h-11 border-2 border-line bg-navy-800 px-3 text-lg text-white outline-none focus:border-orange"
        {...props}
      />
    </label>
  )
}

/** Broadcast tab: straight-edged, italic caps (eyebrows, section labels, status tags). */
export function Badge({
  children,
  tone = 'orange',
  className = '',
}: {
  children: ReactNode
  tone?: 'orange' | 'yellow' | 'live'
  className?: string
}) {
  const styles = { orange: 'bg-orange text-navy-950', yellow: 'bg-yellow text-navy-950', live: 'bg-live text-white' }[tone]
  return (
    <span className={`slant inline-block px-2.5 py-0.5 text-[13px] font-extrabold uppercase tracking-[0.12em] ${styles} ${className}`}>
      {children}
    </span>
  )
}

/** A number on a dark inset, amber digits. */
export function Led({ children, className = '' }: { children: ReactNode; className?: string }) {
  // inline-flex + centring so callers can size the box (h-11 w-11 …) and the digits stay centred.
  return <span className={`led inline-flex items-center justify-center px-2 font-led font-extrabold text-amber ${className}`}>{children}</span>
}

/** Panel. With a title it gets the broadcast header strip. */
export function Card({
  children,
  title,
  aside,
  className = '',
}: {
  children: ReactNode
  title?: ReactNode
  aside?: ReactNode
  className?: string
}) {
  return (
    <section className={`border border-line bg-navy-800 ${className}`}>
      {title && (
        <header className="flex min-h-10 items-center justify-between gap-3 bg-navy-700 px-3 py-1.5">
          <h2 className="text-[17px] font-extrabold tracking-wide uppercase italic">{title}</h2>
          {aside}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

/**
 * Page title: white plate on an offset orange box, the eyebrow tab overlapping its top edge and an optional
 * yellow caption overlapping its bottom edge (direction G4, "overlaps + shadow").
 */
export function PageTitle({
  eyebrow,
  sub,
  live = false,
  children,
}: {
  eyebrow?: string
  sub?: string
  live?: boolean
  children: ReactNode
}) {
  return (
    <header className={`relative mr-2 mb-8 w-fit max-w-[calc(100%-0.5rem)] ${eyebrow ? 'mt-3' : ''}`}>
      <div aria-hidden className="plate absolute inset-0 translate-x-[7px] translate-y-[7px] bg-orange" />
      {eyebrow && (
        <Badge tone={live ? 'live' : 'orange'} className="absolute -top-3 left-2.5 z-[2]">
          {eyebrow}
        </Badge>
      )}
      <div className={`plate relative bg-white pr-10 pl-3.5 text-navy-950 ${eyebrow ? 'pt-4' : 'pt-2.5'} ${sub ? 'pb-4' : 'pb-2.5'}`}>
        <h1 className="font-display text-[30px] leading-[1.05] font-extrabold uppercase italic">{children}</h1>
      </div>
      {sub && (
        <Badge tone="yellow" className="absolute -bottom-3.5 left-6 z-[2]">
          {sub}
        </Badge>
      )}
    </header>
  )
}

/** Main call to action: an orange angled bar on a yellow offset box. */
export function ActionLink({ to, children }: { to: string; children: string }) {
  return (
    <div className="relative mr-[6px] mb-[6px]">
      <div aria-hidden className="plate absolute inset-0 translate-x-[6px] translate-y-[6px] bg-yellow" />
      <Link
        to={to}
        className="plate relative flex min-h-14 items-center bg-orange pr-8 pl-4 font-display text-[22px] leading-tight font-extrabold text-navy-950 uppercase italic hover:bg-white"
      >
        {children} ▸
      </Link>
    </div>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <p role="alert" className="text-base font-semibold text-danger">
      {children}
    </p>
  ) : null
}
