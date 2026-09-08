import Link from 'next/link'
import { AuthForm } from '../../../features/auth/auth-form'

export default function SignUpPage() {
  return (
    <main className="page-content" id="main-content">
      <h1>Create an account</h1>
      <p>
        Confirm your email, then an administrator must approve your membership before you can access
        member content.
      </p>
      <AuthForm mode="sign-up" />
      <p>
        Already registered? <Link href="/sign-in">Sign in</Link>.
      </p>
    </main>
  )
}
