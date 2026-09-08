import { z } from 'zod'
import { createBankSyncService } from '@umunara/api/bank/context'
import { requireBankSyncSecret } from '../../../../../../lib/bank-sync-request'
import { jsonResponse, readJson } from '../../../../http'

export const runtime = 'nodejs'
export const maxDuration = 60
export async function POST(request: Request): Promise<Response> {
  return jsonResponse(async () => {
    requireBankSyncSecret(request)
    const input = z
      .object({ connectionId: z.string().uuid() })
      .strict()
      .parse(await readJson(request))
    return createBankSyncService().sync(input.connectionId)
  })
}
