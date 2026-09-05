import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, ProfileRow } from '../database.types'

export class ProfileRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getById(userId: string): Promise<ProfileRow | null> {
    const { data, error } = await this.client.from('profiles').select('*').eq('id', userId).maybeSingle()

    if (error) {
      throw new Error(`Unable to load profile: ${error.message}`)
    }

    return data
  }
}
