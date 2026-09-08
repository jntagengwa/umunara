import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json, SiteSettingRow } from '../database.types'
import { databaseResult } from './result'
import { getPageRange, toPaginatedResult, type PaginatedResult, type PageQuery } from './pagination'

export class SiteSettingsRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async upsert(key: string, value: Json): Promise<SiteSettingRow> {
    return databaseResult(
      await this.client
        .from('site_settings')
        .upsert({ key, value }, { onConflict: 'key' })
        .select('*')
        .single(),
    )
  }

  async getByKey(key: string): Promise<SiteSettingRow | null> {
    const { data, error } = await this.client.from('site_settings').select('*').eq('key', key).maybeSingle()

    if (error) {
      throw new Error(`Unable to load site setting: ${error.message}`)
    }

    return data
  }

  async list(query: PageQuery): Promise<PaginatedResult<SiteSettingRow>> {
    const { from, to } = getPageRange(query)
    const { data, error, count } = await this.client
      .from('site_settings')
      .select('*', { count: 'exact' })
      .order('key', { ascending: true })
      .range(from, to)

    if (error) {
      throw new Error(`Unable to load site settings: ${error.message}`)
    }

    return toPaginatedResult(data, count, query)
  }
}
