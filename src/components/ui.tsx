import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'border-orange bg-orange font-display uppercase text-navy-950 hover:bg-yellow hover:border-yellow',
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

/** Slanted broadcast caption, e.g. an eyebrow or section label. */
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
    <span className={`slant inline-block px-3 py-0.5 text-sm font-extrabold uppercase tracking-[0.15em] ${styles} ${className}`}>
      {children}
    </span>
  )
}

/** A number on a dark dot-matrix LED inset. */
export function Led({ children, className = '' }: { children: ReactNode; className?: string }) {
  // inline-flex + centring so callers can size the box (h-11 w-11 …) and the digits stay centred.
  return <span className={`led inline-flex items-center justify-center px-2 font-led text-amber ${className}`}>{children}</span>
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
        <header className="flex min-h-10 items-center justify-between gap-3 border-b-2 border-orange bg-navy-900 px-4 py-1.5">
          <h2 className="text-base font-extrabold uppercase tracking-[0.15em]">{title}</h2>
          {aside}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function PageTitle({ eyebrow, children }: { eyebrow?: string; children: ReactNode }) {
  return (
    <header className="mb-5 flex flex-col items-start gap-1">
      {eyebrow && <Badge className="ml-1">{eyebrow}</Badge>}
      <h1 className="font-display text-3xl leading-tight uppercase">{children}</h1>
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
