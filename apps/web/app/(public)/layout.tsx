import type { ReactNode } from 'react'
import { SiteHeader } from '../../components/site-header'
import { SiteFooter } from '../../components/site-footer'

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-site">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  )
}
