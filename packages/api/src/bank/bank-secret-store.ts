import 'server-only'
import { createCipheriv, randomBytes } from 'node:crypto'
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
}
