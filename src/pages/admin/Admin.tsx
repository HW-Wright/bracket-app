import { Navigate } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { PageTitle } from '../../components/ui'
import AdminBracket from './AdminBracket'
import AdminStage from './AdminStage'
import AdminUsers from './AdminUsers'

export default function Admin() {
  const { profile } = useAuth()
  if (!profile?.is_admin) return <Navigate to="/" replace />
  return (
    <>
      <PageTitle eyebrow="Harry only">Admin</PageTitle>
      <div className="flex flex-col gap-6">
        <AdminStage />
        <AdminBracket />
        <AdminUsers />
      </div>
    </>
  )
}
