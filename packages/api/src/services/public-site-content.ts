import 'server-only'
import { defaultHomeHero, homeHeroSchema, type HomeHero } from '@umunara/schemas'

export interface PublicSiteContentStore {
  getHomeHero(): Promise<unknown>
}

export class PublicSiteContentService {
  constructor(private readonly repository: PublicSiteContentStore) {}

  async getHomeHero(): Promise<HomeHero> {
    const value = await this.repository.getHomeHero()
    return value === null ? defaultHomeHero : homeHeroSchema.parse(value)
  }
}
