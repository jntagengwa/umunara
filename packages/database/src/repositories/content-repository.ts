import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, EventRow, PostRow, ResourceRow } from '../database.types'
import { getPageRange, toPaginatedResult, type PaginatedResult, type PageQuery } from './pagination'

export class ContentRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async listPosts(query: PageQuery): Promise<PaginatedResult<PostRow>> {
    const { from, to } = getPageRange(query)
    const { data, error, count } = await this.client
      .from('posts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)

    if (error) {
      throw new Error(`Unable to load posts: ${error.message}`)
    }

    return toPaginatedResult(data, count, query)
  }

  async listEvents(query: PageQuery): Promise<PaginatedResult<EventRow>> {
    const { from, to } = getPageRange(query)
    const { data, error, count } = await this.client
      .from('events')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)

    if (error) {
      throw new Error(`Unable to load events: ${error.message}`)
    }

    return toPaginatedResult(data, count, query)
  }

  async listResources(query: PageQuery): Promise<PaginatedResult<ResourceRow>> {
    const { from, to } = getPageRange(query)
    const { data, error, count } = await this.client
      .from('resources')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)

    if (error) {
      throw new Error(`Unable to load resources: ${error.message}`)
    }

    return toPaginatedResult(data, count, query)
  }
}
