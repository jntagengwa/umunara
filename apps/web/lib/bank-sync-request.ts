import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'
import { ApiError } from '@umunara/api'

export function requireBankSyncSecret(request: Request): void {
  const secret = process.env.BANK_SYNC_SECRET
  if (!secret || secret.length < 32) throw new ApiError(503, 'Bank synchronization is unavailable.')
  const authorization = request.headers.get('authorization') ?? ''
  if (
    authorization.length > 1024 ||
    !timingSafeEqual(
      createHash('sha256').update(authorization).digest(),
      createHash('sha256').update(`Bearer ${secret}`).digest()
    )
  )
    throw new ApiError(401, 'Unauthorized.')
}

export async function readBankWebhookBody(request: Request): Promise<string> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    throw new ApiError(415, 'Use application/json.')
  const reader = request.body?.getReader()
  if (!reader) throw new ApiError(400, 'Invalid request.')
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 64 * 1024) {
        await reader.cancel()
        throw new ApiError(413, 'Request too large.')
      }
      chunks.push(value)
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
  } finally {
    reader.releaseLock()
  }
}
