import Link from 'next/link'

export default function CheckEmailPage() {
  return (
    <main className="page-content" id="main-content">
      <h1>Check your email</h1>
      <p>
        If your registration was accepted, you will receive a confirmation link. Open it to verify
        your email. Check your spam folder too.
      </p>
      <p>Membership approval is still required after email confirmation.</p>
      <p>
        If you already have an account, <Link href="/sign-in">sign in</Link>.
      </p>
    </main>
  )
}
