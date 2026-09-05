import 'server-only'
import { AuthSessionMissingError, type SupabaseClient } from '@supabase/supabase-js'
import type { Database, ProfileRow } from '../database.types'
import { ProfileRepository } from './profile-repository'

export class AuthRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

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
