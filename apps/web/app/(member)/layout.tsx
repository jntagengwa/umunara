import type { ReactNode } from 'react'
import { requirePageRole } from '../../lib/page-access'
import { SiteHeader } from '../../components/site-header'
import { SiteFooter } from '../../components/site-footer'

export default async function MemberLayout({ children }: { children: ReactNode }) {
  await requirePageRole('member')
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  )
}
