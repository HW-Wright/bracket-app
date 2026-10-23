import { Navigate } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { PageTitle } from '../../components/ui'
import AdminUsers from './AdminUsers'

export default function Admin() {
  const { profile } = useAuth()
  if (!profile?.is_admin) return <Navigate to="/" replace />
  return (
    <>
      <PageTitle eyebrow="Harry only">Admin</PageTitle>
      <AdminUsers />
    </>
  )
}
