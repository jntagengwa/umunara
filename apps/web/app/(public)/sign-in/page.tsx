import Link from 'next/link'
import { AuthForm } from '../../../features/auth/auth-form'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmation?: string }>
}) {
  const failed = (await searchParams).confirmation === 'failed'
  return (
    <main className="page-content" id="main-content">
      <h1>Sign in</h1>
      {failed && (
        <p role="alert">
          This confirmation link is invalid or expired. Try signing in if you have already confirmed
          your email.
        </p>
      )}
      <AuthForm mode="sign-in" />
      <p>
        New to Umunara? <Link href="/sign-up">Create an account</Link>.
      </p>
    </main>
  )
}
