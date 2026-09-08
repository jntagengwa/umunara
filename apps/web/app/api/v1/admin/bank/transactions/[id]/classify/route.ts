import { createReconciliationService } from '@umunara/api/bank/reconciliation-context'
import { bankClassifySchema, bankTransactionIdSchema } from '@umunara/schemas'
import { requireBankAdmin } from '../../../../../../../../lib/bank-request'
import { jsonResponse, readJson } from '../../../../../../http'

export const runtime = 'nodejs'
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return jsonResponse(async () => {
    const actor = await requireBankAdmin(request)
    const id = bankTransactionIdSchema.parse((await context.params).id)
    const input = bankClassifySchema.parse(await readJson(request))
    return createReconciliationService().classify(actor, id, input.classification)
  })
}
