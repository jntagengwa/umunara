import 'server-only'
import { createAdminClient } from '@umunara/database/admin'
import { BankRepository } from '@umunara/database/repositories'
import { ApiError } from '../errors'
import { BankConnectionService } from './bank-connection-service'
import { PlaidAdapter } from './plaid-adapter'
import { VaultBankSecretStore } from './bank-secret-store'

export function createBankConnectionService(): BankConnectionService {
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
    return new BankConnectionService(
      new PlaidAdapter({
        clientId: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        environment: PLAID_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
      }),
      secrets,
      new BankRepository(createAdminClient())
    )
  } catch {
    throw new ApiError(503, 'Bank connections are temporarily unavailable.')
  }
}
