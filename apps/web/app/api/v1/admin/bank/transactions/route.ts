import { createReconciliationService } from '@umunara/api/bank/reconciliation-context'
import { requireBankAdmin } from '../../../../../../lib/bank-request'
import { readBankFilters } from '../../../../../../lib/bank-review-request'
import { jsonResponse } from '../../../../http'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  return jsonResponse(async () => {
    const actor = await requireBankAdmin(request)
    const query = readBankFilters(request)
    return createReconciliationService().list(actor, query)
  })
}
