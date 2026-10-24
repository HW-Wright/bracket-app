import { useEffect } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { useBracket } from '../bracket/BracketProvider'
import { useProgress } from '../bracket/useProgress'
import { useLatestResults } from '../bracket/useLatestResults'
import { useKeyboardAware } from '../lib/useKeyboardAware'
import Crawl from './Crawl'

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
          isActive ? 'bg-navy-700 font-extrabold text-white shadow-[inset_0_3px_0_var(--color-orange)]' : 'text-muted'
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
    <Crawl
      label="News"
      tone="orange"
      items={items}
      pinned={
        <span className="flex items-center gap-1.5 bg-navy-950 px-2.5 font-sans text-[13px] font-extrabold tracking-wider text-white italic">
          {live && <span className="h-2 w-2 rounded-full bg-danger motion-safe:animate-pulse" aria-hidden />}
          {live ? 'LIVE' : 'LATEST'}
        </span>
      }
    />
  )
}

/** Under the tab bar: every result from the most recently closed round. Hidden until a round has closed. */
function ResultsCrawl() {
  const { bracket } = useBracket()
  const results = useLatestResults(bracket?.id, bracket?.phase === 'live' || bracket?.phase === 'complete')

  // Bars pinned above the tab bar (save / merge / lock) read this to clear the extra strip.
  useEffect(() => {
    document.documentElement.style.setProperty('--results-h', results ? '26px' : '0px')
  }, [results])

  if (!results) return null
  const round = ['R64', 'R32', 'R16', 'QF', 'SF', 'FINAL'][results.stage.round - 1]
  return (
    <Crawl
      label={`${results.stage.label} results`}
      tone="yellow"
      items={results.lines}
      pinned={<span className="flex items-center bg-navy-950 px-2.5 font-sans text-[12px] font-extrabold text-yellow italic">{round} RESULTS</span>}
    />
  )
}

export default function Layout() {
  const { profile } = useAuth()
  useKeyboardAware()
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 bg-navy-900 pt-[env(safe-area-inset-top)]">
        <Ticker />
        <div className="flex h-[52px] items-center justify-between border-b-[3px] border-orange bg-navy-800 pr-2 pl-4">
          <Link to="/" className="font-display text-[21px] font-extrabold uppercase italic">
            The Gang <span className="font-semibold text-orange">Does a Bracket</span>
          </Link>
          <Link
            to="/profile"
            aria-label="Profile"
            className="flex h-11 w-11 items-center justify-center"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white font-display text-[15px] font-extrabold text-navy-950">
              {profile?.display_name.charAt(0).toUpperCase()}
            </span>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-6 pb-[calc(6rem+var(--results-h,0px)+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <nav
        aria-label="Main"
        className="hide-with-keyboard pin-to-visible-bottom fixed inset-x-0 bottom-0 z-10 border-t border-line bg-navy-800 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex max-w-xl">
          <Tab to="/" label="Home" icon="home" />
          <Tab to="/nominate" label="Nominate" icon="nominate" />
          <Tab to="/vote" label="Vote" icon="vote" />
          <Tab to="/bracket" label="Bracket" icon="bracket" />
          <Tab to="/stats" label="Stats" icon="stats" />
          {profile?.is_admin && <Tab to="/admin" label="Admin" icon="admin" />}
        </div>
        <ResultsCrawl />
      </nav>
    </div>
  )
}
