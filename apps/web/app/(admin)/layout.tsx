import type { ReactNode } from 'react'
import Link from 'next/link'
import { requirePageRole } from '../../lib/page-access'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { actor } = await requirePageRole('editor')
  return (
    <>
      <nav className="workspace-nav" aria-label="Administration">
        <Link href="/">Umunara home</Link>
        <Link href="/admin">Administration</Link>
        <Link href="/admin/content">Home content</Link>
        <Link href="/account">Account</Link>
        {actor.role === 'admin' && <Link href="/admin/members">Member approvals</Link>}
      </nav>
      {children}
    </>
  )
}
