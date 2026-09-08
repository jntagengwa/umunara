import 'server-only'
import { createAdminClient } from '../admin'
import type { Json } from '../database.types'
import { RepositoryError } from './result'

// Public projection is deliberately limited to this named setting; general settings retain RLS.
export class PublicSiteContentRepository {
  async getHomeHero(): Promise<Json | null> {
    const { data, error } = await createAdminClient()
      .from('site_settings')
      .select('value')
      .eq('key', 'home-hero')
      .maybeSingle()
    if (error) throw new RepositoryError(error.code)
    return data?.value ?? null
  }
}
