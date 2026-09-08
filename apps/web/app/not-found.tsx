import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="page-content" id="main-content">
      <h1>Page unavailable</h1>
      <p>This page could not be found or your account does not have access.</p>
      <Link href="/">Return to Umunara home</Link>
    </main>
  )
}
