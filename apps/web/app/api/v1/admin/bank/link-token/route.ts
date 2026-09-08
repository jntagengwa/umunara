import { createBankConnectionService } from '@umunara/api/bank/context'
import { bankConnectionConsentSchema } from '@umunara/schemas'
import { requireBankAdmin } from '../../../../../../lib/bank-request'
import { jsonResponse, readJson } from '../../../../http'

export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  return jsonResponse(async () => {
    const actor = await requireBankAdmin(request)
    bankConnectionConsentSchema.parse(await readJson(request))
    return createBankConnectionService().createLinkToken(actor)
  })
}
