import Link from 'next/link'
import { requirePageRole } from '../../../lib/page-access'

export default async function AdminPage() {
  await requirePageRole('editor')
  return (
    <main className="page-content" id="main-content">
      <h1>Administration</h1>
      <p>Manage Umunara’s website content.</p>
      <Link href="/admin/content">Edit home content</Link>
    </main>
  )
}
