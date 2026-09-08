import 'server-only'
import { createAdminClient } from '@umunara/database/admin'
import { BankRepository, BankSyncRepository } from '@umunara/database/repositories'
import { ApiError } from '../errors'
import { BankConnectionService } from './bank-connection-service'
import { PlaidAdapter } from './plaid-adapter'
import { VaultBankSecretStore } from './bank-secret-store'
import { BankSyncService } from './bank-sync-service'
import { PlaidWebhookVerifier } from './plaid-webhook-verifier'
import { PlaidWebhookKeyCache } from './plaid-webhook-key-cache'

const webhookKeys = { sandbox: new PlaidWebhookKeyCache(), production: new PlaidWebhookKeyCache() }

function createBankDependencies() {
  const {
    PLAID_CLIENT_ID,
    PLAID_SECRET,
    PLAID_ENVIRONMENT,
    BANK_SECRET_VAULT_URL,
    BANK_SECRET_VAULT_MOUNT,
    BANK_SECRET_VAULT_TOKEN,
    BANK_SECRET_ENCRYPTION_KEY,
  } = process.env
  if (
    !PLAID_CLIENT_ID ||
    !PLAID_SECRET ||
    !['sandbox', 'production'].includes(PLAID_ENVIRONMENT ?? '') ||
    !BANK_SECRET_VAULT_URL ||
    !BANK_SECRET_VAULT_MOUNT ||
    !BANK_SECRET_VAULT_TOKEN ||
    !BANK_SECRET_ENCRYPTION_KEY
  )
    throw new ApiError(503, 'Bank connections are temporarily unavailable.')
  try {
    const secrets = new VaultBankSecretStore({
      url: BANK_SECRET_VAULT_URL,
      mount: BANK_SECRET_VAULT_MOUNT,
      token: BANK_SECRET_VAULT_TOKEN,
      encryptionKey: BANK_SECRET_ENCRYPTION_KEY,
    })
    return {
      provider: new PlaidAdapter({
        clientId: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        environment: PLAID_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
      }),
      secrets,
    }
  } catch {
    throw new ApiError(503, 'Bank connections are temporarily unavailable.')
  }
}

export function createBankConnectionService(): BankConnectionService {
  const { provider, secrets } = createBankDependencies()
  return new BankConnectionService(provider, secrets, new BankRepository(createAdminClient()))
}

export function createBankSyncService(): BankSyncService {
  const { provider, secrets } = createBankDependencies()
  return new BankSyncService(
    provider,
    secrets,
    new BankSyncRepository(createAdminClient()),
    new PlaidWebhookVerifier(
      provider,
      process.env.PLAID_ENVIRONMENT === 'production' ? webhookKeys.production : webhookKeys.sandbox
    )
  )
}
