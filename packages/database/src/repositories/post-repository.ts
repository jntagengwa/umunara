import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, PostInsert, PostRow, PostUpdate } from '../database.types'
import { getPageRange, toPaginatedResult, type PaginatedResult, type PageQuery } from './pagination'
import { RepositoryError, databaseResult } from './result'

export type ContentListQuery = PageQuery & { scope: 'public' | 'member' | 'all' }

export class PostRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async list(query: ContentListQuery): Promise<PaginatedResult<PostRow>> {
    const { from, to } = getPageRange(query)
    let request = this.client.from('posts').select('*', { count: 'exact' })
    if (query.scope !== 'all')
      request = request.eq('status', 'published').eq('visibility', query.scope)
    const { data, error, count } = await request
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
    if (error) throw new RepositoryError(error.code)
    return toPaginatedResult(data, count, query)
  }

  async getById(id: string): Promise<PostRow | null> {
    const { data, error } = await this.client.from('posts').select('*').eq('id', id).maybeSingle()
    if (error) throw new RepositoryError(error.code)
    return data
  }

  async create(input: PostInsert): Promise<PostRow> {
    return databaseResult(await this.client.from('posts').insert(input).select('*').single())
  }

  async update(id: string, input: PostUpdate): Promise<PostRow> {
    return databaseResult(
      await this.client.from('posts').update(input).eq('id', id).select('*').single(),
    )
  }

  async remove(id: string): Promise<PostRow> {
    return databaseResult(
      await this.client.from('posts').delete().eq('id', id).select('*').single(),
    )
  }
}
