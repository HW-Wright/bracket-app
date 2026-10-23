import { Card, PageTitle } from '../components/ui'

export default function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <>
      <PageTitle>{title}</PageTitle>
      <Card>
        <p className="text-sm text-ivory-muted">{note}</p>
      </Card>
    </>
  )
}
