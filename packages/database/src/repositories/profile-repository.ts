import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, ProfileRow } from '../database.types'
import { databaseResult } from './result'

export class ProfileRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async setRole(id: string, role: ProfileRow['role'], approvedAt: string | null): Promise<ProfileRow> {
    return databaseResult(
      await this.client
        .from('profiles')
        .update({ role, approved_at: approvedAt })
        .eq('id', id)
        .select('*')
        .single(),
    )
  }

  async getById(userId: string): Promise<ProfileRow | null> {
    const { data, error } = await this.client.from('profiles').select('*').eq('id', userId).maybeSingle()

    if (error) {
      throw new Error(`Unable to load profile: ${error.message}`)
    }

    return data
  }
}
