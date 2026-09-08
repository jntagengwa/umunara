import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../admin'
import type { Database, ResourceRow } from '../database.types'
import { getPageRange, toPaginatedResult, type PageQuery, type PaginatedResult } from './pagination'
import { RepositoryError } from './result'

export class ResourceRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getById(id: string): Promise<ResourceRow | null> {
    const { data, error } = await this.client
      .from('resources')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw new RepositoryError(error.code)
    return data
  }

  async list(query: PageQuery): Promise<PaginatedResult<ResourceRow>> {
    const { from, to } = getPageRange(query)
    const { data, error, count } = await this.client
      .from('resources')
      .select('*', { count: 'exact' })
      .eq('status', 'published')
      .in('visibility', ['public', 'member'])
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)
    if (error) throw new RepositoryError(error.code)
    return toPaginatedResult(data, count, query)
  }

  async sign(path: string, expiresIn: number): Promise<string> {
    // Only the authorized service supplies the stored path and short expiry.
    // Member credentials cannot read or sign this private bucket directly.
    const { data, error } = await createAdminClient()
      .storage.from('resources')
      .createSignedUrl(path, expiresIn, { download: true })
    if (error || !data) throw new Error('Unable to create a resource download URL.')
    return data.signedUrl
  }
}
