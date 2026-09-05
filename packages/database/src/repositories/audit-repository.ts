import 'server-only'
import { createAdminClient } from '../admin'
import type { AuditLogInsert } from '../database.types'
import { RepositoryError } from './result'

export class AuditRepository {
  async append(entry: AuditLogInsert): Promise<void> {
    const { error } = await createAdminClient().from('audit_log').insert(entry)
    if (error) throw new RepositoryError(error.code)
  }
}
