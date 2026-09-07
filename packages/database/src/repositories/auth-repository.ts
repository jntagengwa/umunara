import 'server-only'
import { AuthSessionMissingError, type SupabaseClient } from '@supabase/supabase-js'
import type { Database, ProfileRow } from '../database.types'
import { ProfileRepository } from './profile-repository'

type Credentials = { email: string; password: string }

export class AuthRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  signIn(input: Credentials) {
    return this.client.auth.signInWithPassword(input)
  }

  signUp(input: Credentials & { fullName: string }, confirmationUrl: string) {
    return this.client.auth.signUp({
      email: input.email,
      password: input.password,
      options: { emailRedirectTo: confirmationUrl, data: { full_name: input.fullName } },
    })
  }

  signOut() {
    return this.client.auth.signOut({ scope: 'local' })
  }

  confirm(input: { code: string } | { tokenHash: string }) {
    return 'code' in input
      ? this.client.auth.exchangeCodeForSession(input.code)
      : this.client.auth.verifyOtp({ token_hash: input.tokenHash, type: 'email' })
  }

  async getUser(): Promise<{ id: string; emailConfirmedAt: string | null } | null> {
    const { data, error } = await this.client.auth.getUser()
    if (error instanceof AuthSessionMissingError) return null
    if (error) throw error
    return data.user
      ? { id: data.user.id, emailConfirmedAt: data.user.email_confirmed_at ?? null }
      : null
  }

  async getProfile(
    id: string,
  ): Promise<{ id: string; role: ProfileRow['role']; approvedAt: string | null } | null> {
    const row = await new ProfileRepository(this.client).getById(id)
    return row ? { id: row.id, role: row.role, approvedAt: row.approved_at } : null
  }
}
