import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, EventInsert, EventRow } from '../database.types'
import type { ContentListQuery } from './post-repository'
import { getPageRange, toPaginatedResult, type PaginatedResult } from './pagination'
import { RepositoryError, databaseResult } from './result'

export class EventRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async list(query: ContentListQuery): Promise<PaginatedResult<EventRow>> {
    const { from, to } = getPageRange(query)
    let request = this.client.from('events').select('*', { count: 'exact' })
    if (query.scope !== 'all')
      request = request.eq('status', 'published').eq('visibility', query.scope)
    const { data, error, count } = await request
      .order('starts_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
    if (error) throw new RepositoryError(error.code)
    return toPaginatedResult(data, count, query)
  }

  async create(input: EventInsert): Promise<EventRow> {
    return databaseResult(await this.client.from('events').insert(input).select('*').single())
  }
}
