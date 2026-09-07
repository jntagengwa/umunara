import 'server-only'
import type { AuthRepository } from '@umunara/database/repositories'
import type { AuthResult, SignInInput, SignUpInput } from '@umunara/schemas'
import { ApiError } from '../errors'

export class SessionService {
  constructor(
    private readonly auth: Pick<AuthRepository, 'signIn' | 'signUp' | 'signOut' | 'confirm'>,
  ) {}

  async signIn(input: SignInInput): Promise<AuthResult> {
    const { error } = await this.auth.signIn(input)
    if (error)
      throw new ApiError(
        400,
        'Unable to sign in. Check your email and password and confirm your email before trying again.',
      )
    return { redirectTo: '/account' }
  }

  async signUp(input: SignUpInput, confirmationUrl: string): Promise<AuthResult> {
    const { data, error } = await this.auth.signUp(input, confirmationUrl)
    if (error)
      throw new ApiError(
        400,
        'Unable to create an account. Please try again or sign in if you already have an account.',
      )
    return { redirectTo: data.session ? '/account' : '/check-email' }
  }

  async signOut(): Promise<AuthResult> {
    const { error } = await this.auth.signOut()
    if (error) throw new ApiError(503, 'Unable to sign out. Please try again.')
    return { redirectTo: '/sign-in' }
  }

  async confirm(input: { code: string } | { tokenHash: string }): Promise<boolean> {
    const { error } = await this.auth.confirm(input)
    return !error
  }
}
