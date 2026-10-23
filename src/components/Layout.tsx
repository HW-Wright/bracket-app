import { Link, NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { useBracket } from '../bracket/BracketProvider'
import { useProgress } from '../bracket/useProgress'
import { useKeyboardAware } from '../lib/useKeyboardAware'

const icons: Record<string, string> = {
  home: 'M4 11 12 4l8 7v9h-5v-6H9v6H4z',
  nominate: 'M5 5h14M5 10h14M5 15h9M5 20h6',
  vote: 'M5 12l4 4 10-10',
  bracket: 'M4 5h5v5H4zM4 14h5v5H4zM9 7.5h4v9H9M13 12h7',
  stats: 'M5 20V11M12 20V4M19 20v-6',
  admin: 'M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.5-.8z',
}

function Tab({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `group flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-bold tracking-wider uppercase ${
          isActive ? 'bg-navy-700 text-white' : 'text-muted'
        }`
      }
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[22px] w-[22px] group-aria-[current=page]:text-orange"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path d={icons[icon]} />
      </svg>
      {label}
    </NavLink>
  )
}

/** LED ticker: what's happening right now. */
function Ticker() {
  const { bracket } = useBracket()
  const { progress } = useProgress(bracket?.phase === 'nominations' ? bracket.id : undefined)
  const live = bracket?.phase === 'nominations' || bracket?.phase === 'live'
  const items = !bracket
    ? ['NO BRACKET YET']
    : {
        draft: ['COMING SOON', bracket.title],
        nominations: ['NOMINATIONS OPEN', bracket.title, progress ? `${progress.submitted} OF ${progress.total} HAVE SUBMITTED` : ''],
        review: ['NOMINATIONS CLOSED', 'SEEDING IN PROGRESS'],
        live: ['VOTING OPEN', bracket.title],
        complete: ['FINAL', bracket.title],
      }[bracket.phase].filter(Boolean)

  return (
    <div className="led flex h-[26px] items-center gap-2.5 overflow-hidden px-3 font-led text-[13px] whitespace-nowrap text-amber uppercase">
      {live && (
        <span className="flex items-center gap-1.5 text-danger">
          <span className="h-2 w-2 rounded-full bg-live" aria-hidden />
          LIVE
        </span>
      )}
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-2.5">
          {i > 0 && (
            <span className="text-line" aria-hidden>
              ●
            </span>
          )}
          {item}
        </span>
      ))}
    </div>
  )
}

export default function Layout() {
  const { profile } = useAuth()
  useKeyboardAware()
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 bg-led pt-[env(safe-area-inset-top)] shadow-[0_3px_0_var(--color-yellow)]">
        <Ticker />
        <div className="flex h-[52px] items-center justify-between border-b-4 border-orange bg-navy-800 pr-2 pl-4">
          <Link to="/" className="font-display text-lg italic uppercase">
            The Gang <span className="text-orange">Does a Bracket</span>
          </Link>
          <Link
            to="/profile"
            aria-label="Profile"
            className="flex h-11 w-11 items-center justify-center"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-orange font-display text-sm">
              {profile?.display_name.charAt(0).toUpperCase()}
            </span>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-6 pb-28">
        <Outlet />
      </main>
      <nav
        aria-label="Main"
        className="hide-with-keyboard fixed inset-x-0 bottom-0 z-10 border-t-[3px] border-orange bg-navy-800 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex max-w-xl">
          <Tab to="/" label="Home" icon="home" />
          <Tab to="/nominate" label="Nominate" icon="nominate" />
          <Tab to="/vote" label="Vote" icon="vote" />
          <Tab to="/bracket" label="Bracket" icon="bracket" />
          <Tab to="/stats" label="Stats" icon="stats" />
          {profile?.is_admin && <Tab to="/admin" label="Admin" icon="admin" />}
        </div>
      </nav>
    </div>
  )
}
