import 'server-only'
import { createHash, createPublicKey, timingSafeEqual, verify } from 'node:crypto'
import { z } from 'zod'
import { ApiError } from '../errors'
import type { VerifiedBankWebhook } from './bank-sync-service'
import { PlaidWebhookKeyCache } from './plaid-webhook-key-cache'
function decode(segment: string): unknown {
  const bytes = Buffer.from(segment, 'base64url')
  if (bytes.toString('base64url') !== segment) throw new Error('Invalid encoding')
  return JSON.parse(bytes.toString('utf8'))
}

/** Only Plaid's ES256 JWT profile is accepted; crypto operations use Node/OpenSSL. */
export class PlaidWebhookVerifier {
  constructor(
    private readonly provider: { getWebhookVerificationKey(keyId: string): Promise<unknown> },
    private readonly keys = new PlaidWebhookKeyCache()
  ) {}
  async verify(headers: Headers, body: string): Promise<VerifiedBankWebhook> {
    try {
      if (Buffer.byteLength(body) > 64 * 1024) throw new Error('Too large')
      const token = z.string().min(1).max(4096).parse(headers.get('plaid-verification'))
      const segments = token.split('.')
      if (segments.length !== 3 || segments.some((value) => !/^[A-Za-z0-9_-]+$/.test(value)))
        throw new Error('Invalid JWT')
      const [header, payload, signature] = z
        .tuple([z.string(), z.string(), z.string()])
        .parse(segments)
      const decoded = z
        .object({
          alg: z.literal('ES256'),
          kid: z.string().min(1).max(255),
          typ: z.literal('JWT').optional(),
        })
        .strict()
        .parse(decode(header))
      const now = Math.floor(Date.now() / 1000)
      const signatureBytes = Buffer.from(signature, 'base64url')
      if (signatureBytes.length !== 64 || signatureBytes.toString('base64url') !== signature)
        throw new Error('Invalid signature')
      const claims = z
        .object({
          iat: z.number().int(),
          request_body_sha256: z.string().regex(/^[a-f0-9]{64}$/),
          exp: z.number().int().optional(),
          nbf: z.number().int().optional(),
        })
        .parse(decode(payload))
      if (
        claims.iat > now ||
        now - claims.iat > 300 ||
        (claims.exp !== undefined && claims.exp <= now) ||
        (claims.nbf !== undefined && claims.nbf > now)
      )
        throw new Error('Expired JWT')
      const hash = createHash('sha256').update(body).digest()
      if (!timingSafeEqual(hash, Buffer.from(claims.request_body_sha256, 'hex')))
        throw new Error('Body mismatch')
      // Untrusted claims above only reject cheaply. Nothing is accepted or scheduled
      // until the provider key and signature have authenticated these exact bytes.
      const key = await this.keys.get(this.provider, decoded.kid)
      const verifiedAt = Math.floor(Date.now() / 1000)
      if (
        verifiedAt - claims.iat > 300 ||
        (claims.exp !== undefined && claims.exp <= verifiedAt) ||
        claims.iat < key.created_at ||
        !verify(
          'sha256',
          Buffer.from(`${header}.${payload}`),
          {
            key: createPublicKey({ key, format: 'jwk' }),
            dsaEncoding: 'ieee-p1363',
          },
          signatureBytes
        )
      )
        throw new Error('Invalid signature')
      const event = z
        .object({
          webhook_type: z.string(),
          webhook_code: z.string(),
          item_id: z.string().min(1).max(255),
        })
        .parse(JSON.parse(body))
      if (event.webhook_type !== 'TRANSACTIONS' || event.webhook_code !== 'SYNC_UPDATES_AVAILABLE')
        return null
      return {
        itemId: event.item_id,
        eventType: 'TRANSACTIONS.SYNC_UPDATES_AVAILABLE',
        deduplicationKey: createHash('sha256')
          .update(`${claims.iat}:${claims.request_body_sha256}`)
          .digest('hex'),
      }
    } catch {
      throw new ApiError(401, 'Invalid Plaid webhook.')
    }
  }
}
