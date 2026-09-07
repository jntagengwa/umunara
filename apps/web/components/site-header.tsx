import Image from 'next/image'
import Link from 'next/link'
import logo from '../../../src/umunara_logo.png'
import { SiteNavigation } from './site-navigation'
import { DonateButton } from './donate-button'

export function SiteHeader() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <Link className="site-logo" href="/" aria-label="Umunara home">
          <Image src={logo} alt="Umunara" width={400} height={100} priority />
        </Link>
        <SiteNavigation />
        <DonateButton />
      </header>
    </>
  )
}
