import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

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

export function PageTitle({ eyebrow, children }: { eyebrow?: string; children: ReactNode }) {
  return (
    <header className="mb-5 flex flex-col items-start">
      {eyebrow && <Badge>{eyebrow}</Badge>}
      {/* White title plate with an angled right edge. */}
      <div className="plate max-w-full bg-white py-1.5 pr-8 pl-3 text-navy-950">
        <h1 className="font-display text-[30px] leading-[1.05] font-extrabold uppercase italic">{children}</h1>
      </div>
    </header>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <p role="alert" className="text-base font-semibold text-danger">
      {children}
    </p>
  ) : null
}
