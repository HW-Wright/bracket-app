import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import Layout from './components/Layout'
import ForcePasswordChange from './pages/ForcePasswordChange'
import Home from './pages/Home'
import Login from './pages/Login'
import Placeholder from './pages/Placeholder'
import Profile from './pages/Profile'

const Admin = lazy(() => import('./pages/admin/Admin'))

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
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="nominate" element={<Placeholder title="Nominate" note="Nominations open when Harry starts a bracket." />} />
          <Route path="vote" element={<Placeholder title="Vote" note="Nothing to vote on yet." />} />
          <Route path="bracket" element={<Placeholder title="Bracket" note="The bracket appears once seeding is locked." />} />
          <Route path="archive" element={<Placeholder title="Archive" note="No past brackets yet." />} />
          <Route path="profile" element={<Profile />} />
          <Route path="admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
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
