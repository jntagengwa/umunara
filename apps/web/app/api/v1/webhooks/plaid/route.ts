import { createBankSyncService } from '@umunara/api/bank/context'
import { readBankWebhookBody } from '../../../../../lib/bank-sync-request'
import { jsonResponse } from '../../../http'

export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  return jsonResponse(async () => {
    const rawBody = await readBankWebhookBody(request)
    await createBankSyncService().handleWebhook(request.headers, rawBody)
    return { received: true }
  })
}
