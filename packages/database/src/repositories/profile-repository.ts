import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, ProfileRow } from '../database.types'
import { databaseResult, RepositoryError } from './result'
import { getPageRange, toPaginatedResult, type PageQuery, type PaginatedResult } from './pagination'

export class ProfileRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async approvePending(id: string): Promise<ProfileRow | null> {
    const { data, error } = await this.client
      .from('profiles')
      .update({ role: 'member', approved_at: new Date().toISOString() })
      .eq('id', id)
      .eq('role', 'pending')
      .select('*')
      .maybeSingle()
    if (error) throw new RepositoryError(error.code)
    return data
  }

  async listPending(query: PageQuery): Promise<PaginatedResult<ProfileRow>> {
    const { from, to } = getPageRange(query)
    const { data, error, count } = await this.client
      .from('profiles')
      .select('*', { count: 'exact' })
      .eq('role', 'pending')
      .order('created_at')
      .order('id')
      .range(from, to)
    if (error) throw new RepositoryError(error.code)
    return toPaginatedResult(data, count, query)
  }

  async setRole(
    id: string,
    role: ProfileRow['role'],
    approvedAt: string | null,
  ): Promise<ProfileRow> {
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
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      throw new Error(`Unable to load profile: ${error.message}`)
    }

    return data
  }
}
