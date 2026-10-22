import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router'
import { supabase } from './lib/supabase'

type PingState = { status: 'loading' } | { status: 'ok'; at: string } | { status: 'error'; message: string }

function Home() {
  const [ping, setPing] = useState<PingState>({ status: 'loading' })

  useEffect(() => {
    supabase.rpc('ping').then(({ data, error }) => {
      if (error) setPing({ status: 'error', message: error.message })
      else setPing({ status: 'ok', at: new Date(data as string).toLocaleString() })
    })
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="label-caps">Coming soon</p>
      <h1 className="font-display text-4xl leading-tight text-gold-500">The Gang Does a Bracket</h1>
      <div className="rule-double w-40" />
      <p className="text-sm text-ivory-muted" role="status">
        {ping.status === 'loading' && 'Checking the database…'}
        {ping.status === 'ok' && <>Supabase: connected · {ping.at}</>}
        {ping.status === 'error' && <span className="text-danger">Supabase: {ping.message}</span>}
      </p>
    </main>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="*" element={<Home />} />
      </Routes>
    </HashRouter>
  )
}
