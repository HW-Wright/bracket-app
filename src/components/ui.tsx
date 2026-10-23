import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'border-gold-500 bg-gold-500 text-ink-950 hover:bg-gold-300',
    ghost: 'border-line text-ivory hover:border-gold-700',
    danger: 'border-danger/60 text-danger hover:border-danger',
  }[variant]
  return (
    <button
      className={`min-h-11 rounded-sm border px-4 text-sm font-medium tracking-wide transition-colors disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  )
}

export function TextField({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-caps">{label}</span>
      <input
        className="min-h-11 rounded-sm border border-line bg-ink-900 px-3 text-base text-ivory outline-none focus:border-gold-500"
        {...props}
      />
    </label>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-sm border border-line bg-ink-900 p-4 ${className}`}>{children}</section>
}

export function PageTitle({ eyebrow, children }: { eyebrow?: string; children: ReactNode }) {
  return (
    <header className="mb-5 flex flex-col gap-2">
      {eyebrow && <p className="label-caps">{eyebrow}</p>}
      <h1 className="font-display text-3xl leading-tight text-gold-500">{children}</h1>
      <div className="rule-double w-24" />
    </header>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  ) : null
}
