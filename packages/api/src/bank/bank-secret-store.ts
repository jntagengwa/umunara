import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { BankSecretStore } from './bank-connection-service'

/** Requires a provisioned external Vault KV-v2 mount; this adapter never provisions one. */
export class VaultBankSecretStore implements BankSecretStore {
  private readonly key: Buffer
  private readonly origin: string
  constructor(
    private readonly config: { url: string; mount: string; token: string; encryptionKey: string }
  ) {
    const url = new URL(config.url)
    this.key = Buffer.from(config.encryptionKey, 'base64')
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      !/^[a-zA-Z0-9_-]+$/.test(config.mount) ||
      !config.token ||
      this.key.length !== 32 ||
      this.key.toString('base64') !== config.encryptionKey
    )
      throw new Error('Invalid bank secret storage configuration.')
    this.origin = url.origin
  }
  async save(reference: string, value: Parameters<BankSecretStore['save']>[1]): Promise<void> {
    z.string().uuid().parse(reference)
    const nonce = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce)
    cipher.setAAD(Buffer.from(reference))
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
    const response = await fetch(`${this.origin}/v1/${this.config.mount}/data/bank/${reference}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Vault-Token': this.config.token },
      body: JSON.stringify({
        options: { cas: 0 },
        data: {
          version: 1,
          nonce: nonce.toString('base64'),
          tag: cipher.getAuthTag().toString('base64'),
          ciphertext: ciphertext.toString('base64'),
        },
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error('Bank secret storage unavailable.')
  }

  async read(
    reference: string,
    identity: { connectionId: string; actorId: string }
  ): Promise<Parameters<BankSecretStore['save']>[1]> {
    try {
      z.string().uuid().parse(reference)
      const response = await fetch(
        `${this.origin}/v1/${this.config.mount}/data/bank/${reference}`,
        {
          method: 'GET',
          headers: { 'X-Vault-Token': this.config.token },
          cache: 'no-store',
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
        }
      )
      if (!response.ok) throw new Error('Unavailable')
      const base64 = (length?: number) =>
        z
          .string()
          .min(1)
          .max(8192)
          .refine((value) => {
            const bytes = Buffer.from(value, 'base64')
            return (
              bytes.toString('base64') === value &&
              (length === undefined || bytes.length === length)
            )
          })
      const envelope = z
        .object({
          data: z.object({
            data: z
              .object({
                version: z.literal(1),
                nonce: base64(12),
                tag: base64(16),
                ciphertext: base64(),
              })
              .strict(),
            metadata: z.object({
              destroyed: z.literal(false),
              deletion_time: z.literal(''),
              version: z.literal(1),
            }),
          }),
        })
        .parse(await response.json()).data.data
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(envelope.nonce, 'base64')
      )
      decipher.setAAD(Buffer.from(reference))
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
        decipher.final(),
      ])
      try {
        const value = z
          .object({
            connectionId: z.string().uuid(),
            actorId: z.string().uuid(),
            itemId: z.string().min(1).max(255),
            accessToken: z.string().min(1).max(1000),
          })
          .strict()
          .parse(JSON.parse(plaintext.toString('utf8')))
        if (value.connectionId !== identity.connectionId || value.actorId !== identity.actorId)
          throw new Error('Invalid identity')
        return value
      } finally {
        plaintext.fill(0)
      }
    } catch {
      throw new Error('Bank secret storage unavailable.')
    }
  }
}
