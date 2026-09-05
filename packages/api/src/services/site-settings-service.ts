import 'server-only'
import type { Json, SiteSettingRow } from '@umunara/database'
import { settingKeySchema, siteSettingUpdateSchema } from '@umunara/schemas'
import type { Actor } from '../auth/require-user'
import { requireRole } from '../auth/require-role'
import type { CacheInvalidator } from '../cache/invalidation'
import { cacheTags } from '../cache/tags'
import { ApiError } from '../errors'
import type { AuditWriter } from './audit-service'

export interface SiteSettingDto {
  key: string
  value: Json
}
export interface SiteSettingStore {
  getByKey(key: string): Promise<SiteSettingRow | null>
  upsert(key: string, value: Json): Promise<SiteSettingRow>
}

export class SiteSettingsService {
  constructor(
    private readonly repository: SiteSettingStore,
    private readonly audit: AuditWriter,
    private readonly cache: CacheInvalidator,
  ) {}

  async get(actor: Actor | null, key: string): Promise<SiteSettingDto> {
    requireRole(actor, 'editor')
    const row = await this.repository.getByKey(settingKeySchema.parse(key))
    if (!row) throw new ApiError(404, 'Site setting not found.')
    return { key: row.key, value: row.value }
  }

  async update(actor: Actor, key: string, input: unknown): Promise<SiteSettingDto> {
    requireRole(actor, 'editor')
    const parsedKey = settingKeySchema.parse(key)
    const { value } = siteSettingUpdateSchema.parse(input)
    const row = await this.repository.upsert(parsedKey, value)
    try {
      await this.audit.write(actor, 'update', 'site-setting', row.id, { key: row.key })
    } finally {
      this.cache.invalidate([cacheTags.siteSettings(parsedKey.split('.')[0])])
    }
    return { key: row.key, value: row.value }
  }
}
