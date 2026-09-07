import Link from 'next/link'
import { requirePageRole } from '../../../lib/page-access'
import { SignOutButton } from '../../../features/auth/sign-out-button'

export default async function AccountPage() {
  const { actor } = await requirePageRole('pending')
  return (
    <main className="page-content" id="main-content">
      <h1>Your account</h1>
      {actor.role === 'pending' ? (
        <>
          <h2>Awaiting membership approval</h2>
          <p>
            Your email is confirmed. An administrator must approve your membership before you can
            access member content. Check this page again after approval.
          </p>
        </>
      ) : (
        <>
          <p>Your membership is approved.</p>
          <p>
            <Link href="/member">Go to the member community</Link>
          </p>
          {(actor.role === 'editor' || actor.role === 'admin') && (
            <p>
              <Link href="/admin">Go to administration</Link>
            </p>
          )}
        </>
      )}
      <SignOutButton />
    </main>
  )
}
