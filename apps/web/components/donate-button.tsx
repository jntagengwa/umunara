import Link from 'next/link'

export function DonateButton() {
  return (
    <Link className="header-give" href="/give">
      Give
    </Link>
  )
}
