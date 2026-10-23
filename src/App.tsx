import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { BracketProvider } from './bracket/BracketProvider'
import Layout from './components/Layout'
import ForcePasswordChange from './pages/ForcePasswordChange'
import Home from './pages/Home'
import Login from './pages/Login'
import Profile from './pages/Profile'

const Admin = lazy(() => import('./pages/admin/Admin'))
const Nominate = lazy(() => import('./pages/nominate/Nominate'))
const AdminReview = lazy(() => import('./pages/admin/review/AdminReview'))
const Vote = lazy(() => import('./pages/Vote'))
const Bracket = lazy(() => import('./pages/bracket/Bracket'))
const EntryPage = lazy(() => import('./pages/EntryPage'))
const Stats = lazy(() => import('./pages/Stats'))
const Archive = lazy(() => import('./pages/archive/Archive'))
const ArchivedBracket = lazy(() => import('./pages/archive/ArchivedBracket'))

function Splash() {
  return <div className="min-h-dvh" aria-busy="true" />
}

function Gate() {
  const { loading, session, profile } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Login />
  if (!profile) return <Splash />
  if (profile.must_change_password) return <ForcePasswordChange />

  return (
    <BracketProvider>
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="nominate" element={<Nominate />} />
            <Route path="vote" element={<Vote />} />
            <Route path="bracket" element={<Bracket />} />
            <Route path="entry/:id" element={<EntryPage />} />
            <Route path="stats" element={<Stats />} />
            <Route path="archive" element={<Archive />} />
            <Route path="archive/:id" element={<ArchivedBracket />} />
            <Route path="profile" element={<Profile />} />
            <Route path="admin" element={<Admin />} />
            <Route path="admin/review" element={<AdminReview />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BracketProvider>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </HashRouter>
  )
}
