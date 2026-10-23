import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { useKeyboardAware } from '../lib/useKeyboardAware'

const icons: Record<string, string> = {
  home: 'M4 11 12 4l8 7v9h-5v-6H9v6H4z',
  nominate: 'M5 5h14M5 10h14M5 15h9M5 20h6',
  vote: 'M5 12l4 4 10-10',
  bracket: 'M4 5h5v5H4zM4 14h5v5H4zM9 7.5h4v9H9M13 12h7',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1.5-4 4.5-6 8-6s6.5 2 8 6',
  admin: 'M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.5-.8z',
}

function Tab({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[0.65rem] uppercase tracking-[0.15em] ${
          isActive ? 'text-gold-500' : 'text-ivory-muted'
        }`
      }
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d={icons[icon]} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {label}
    </NavLink>
  )
}

export default function Layout() {
  const { profile } = useAuth()
  useKeyboardAware()
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-ink-950/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
        <p className="py-3 text-center font-display text-lg text-gold-500">The Gang Does a Bracket</p>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-6 pb-28">
        <Outlet />
      </main>
      <nav
        aria-label="Main"
        className="hide-with-keyboard fixed inset-x-0 bottom-0 z-10 border-t border-gold-700/60 bg-ink-900 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex max-w-xl">
          <Tab to="/" label="Home" icon="home" />
          <Tab to="/nominate" label="Nominate" icon="nominate" />
          <Tab to="/vote" label="Vote" icon="vote" />
          <Tab to="/bracket" label="Bracket" icon="bracket" />
          <Tab to="/profile" label="Profile" icon="profile" />
          {profile?.is_admin && <Tab to="/admin" label="Admin" icon="admin" />}
        </div>
      </nav>
    </div>
  )
}
