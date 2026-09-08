import 'server-only'
import { randomUUID } from 'node:crypto'
import {
  bankConnectionDtoSchema,
  bankExchangeTokenSchema,
  bankLinkTokenSchema,
  type BankConnectionDto,
  type BankCreateConnection,
  type BankConnectionAccount,
} from '@umunara/schemas'
import { requireRole } from '../auth/require-role'
import type { Actor } from '../auth/require-user'
import { ApiError } from '../errors'

export interface BankProvider {
  createLinkToken(actorId: string): Promise<{ linkToken: string }>
  exchangePublicToken(publicToken: string): Promise<{ itemId: string; accessToken: string }>
  getSelectedAccounts(
    accessToken: string,
    selectedAccountIds: string[]
  ): Promise<{ institutionName: string; accounts: BankConnectionAccount[] }>
  removeItem(accessToken: string): Promise<void>
}
export interface BankSecretStore {
  save(
    reference: string,
    value: { connectionId: string; actorId: string; itemId: string; accessToken: string }
  ): Promise<void>
}
export class BankConnectionService {
  constructor(
    private readonly provider: BankProvider,
    private readonly secrets: BankSecretStore,
    private readonly repository: {
      createConnection(input: BankCreateConnection): Promise<BankConnectionDto>
    }
  ) {}

  async createLinkToken(actor: Actor | null): Promise<{ linkToken: string }> {
    requireRole(actor, 'admin')
    try {
      return bankLinkTokenSchema.parse(await this.provider.createLinkToken(actor.id))
    } catch {
      throw new ApiError(503, 'Bank connections are temporarily unavailable.')
    }
  }

  async exchangePublicToken(
    actor: Actor | null,
    publicToken: string,
    selectedAccountIds: string[]
  ): Promise<BankConnectionDto> {
    requireRole(actor, 'admin')
    const input = bankExchangeTokenSchema.parse({
      publicToken,
      selectedAccountIds,
      businessAccountConsent: true,
    })
    let exchanged: { itemId: string; accessToken: string } | undefined
    let persistenceStarted = false
    try {
      exchanged = await this.provider.exchangePublicToken(input.publicToken)
      const selected = await this.provider.getSelectedAccounts(
        exchanged.accessToken,
        input.selectedAccountIds
      )
      const connectionId = randomUUID()
      const secretReference = randomUUID()
      await this.secrets.save(secretReference, { ...exchanged, connectionId, actorId: actor.id })
      // A lost database response can mean commit succeeded. Preserve the encrypted bundle
      // and live Item for operator recovery instead of revoking a possibly active connection.
      persistenceStarted = true
      return bankConnectionDtoSchema.parse(
        await this.repository.createConnection({
          connectionId,
          actorId: actor.id,
          secretReference,
          ...selected,
        })
      )
    } catch {
      if (exchanged && !persistenceStarted) {
        try {
          await this.provider.removeItem(exchanged.accessToken)
        } catch {
          throw new ApiError(
            503,
            'Bank connection could not be completed or revoked. Contact an administrator before reconnecting.'
          )
        }
      }
      throw new ApiError(
        503,
        persistenceStarted
          ? 'Bank connection could not be confirmed. Contact an administrator before reconnecting.'
          : 'Unable to connect the bank account. Please try again later.'
      )
    }
  }
}
