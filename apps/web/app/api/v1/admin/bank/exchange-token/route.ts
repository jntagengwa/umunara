import { createBankConnectionService } from '@umunara/api/bank/context'
import { bankExchangeTokenSchema } from '@umunara/schemas'
import { requireBankAdmin } from '../../../../../../lib/bank-request'
import { jsonResponse, readJson } from '../../../../http'

export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  return jsonResponse(async () => {
    const actor = await requireBankAdmin(request)
    const input = bankExchangeTokenSchema.parse(await readJson(request))
    return createBankConnectionService().exchangePublicToken(
      actor,
      input.publicToken,
      input.selectedAccountIds
    )
  }, 201)
}
