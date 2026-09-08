import 'server-only'
import { createAdminClient } from '@umunara/database/admin'
import { BankReviewRepository, ReconciliationRepository } from '@umunara/database/repositories'
import { routeCache } from '../cache/invalidation'
import { ReconciliationService } from './reconciliation-service'

export function createReconciliationService(): ReconciliationService {
  const client = createAdminClient()
  return new ReconciliationService(
    new BankReviewRepository(client),
    new ReconciliationRepository(client),
    routeCache
  )
}
