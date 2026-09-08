import type { ReactNode } from 'react'
import Link from 'next/link'
import { requirePageRole } from '../../lib/page-access'
import { SiteHeader } from '../../components/site-header'
import { SiteFooter } from '../../components/site-footer'

export default async function MemberLayout({ children }: { children: ReactNode }) {
  await requirePageRole('member')
  return (
    <>
      <SiteHeader />
      <nav className="workspace-nav" aria-label="Member community">
        <Link href="/member">Community</Link>
        <Link href="/member/resources">Resources</Link>
        <Link href="/member/events">Events</Link>
      </nav>
      {children}
      <SiteFooter />
    </>
  )
}
