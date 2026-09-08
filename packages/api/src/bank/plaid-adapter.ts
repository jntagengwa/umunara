import 'server-only'
import { z } from 'zod'
import { bankConnectionAccountSchema, type BankConnectionAccount } from '@umunara/schemas'
import { ApiError } from '../errors'
import type { BankProvider } from './bank-connection-service'

const identifier = z.string().min(1).max(255)
const accountsResponse = z.object({
  item: z.object({ institution_id: identifier }),
  accounts: z
    .array(
      z.object({
        account_id: identifier,
        name: z.string(),
        mask: z.string().nullable(),
        type: z.string(),
        subtype: z.string().nullable(),
        balances: z.object({ iso_currency_code: z.string().nullable() }),
      })
    )
    .max(100),
})
export class PlaidAdapter implements BankProvider {
  private readonly origin: string
  constructor(
    private readonly config: {
      clientId: string
      secret: string
      environment: 'sandbox' | 'production'
    }
  ) {
    if (
      !config.clientId ||
      !config.secret ||
      !['sandbox', 'production'].includes(config.environment)
    )
      throw new Error('Invalid Plaid configuration.')
    this.origin =
      config.environment === 'production'
        ? 'https://production.plaid.com'
        : 'https://sandbox.plaid.com'
  }
  private async request(path: string, body: Record<string, unknown>): Promise<unknown> {
    try {
      const response = await fetch(`${this.origin}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PLAID-CLIENT-ID': this.config.clientId,
          'PLAID-SECRET': this.config.secret,
          'Plaid-Version': '2020-09-14',
        },
        body: JSON.stringify(body),
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error('Provider unavailable.')
      return await response.json()
    } catch {
      throw new ApiError(503, 'Bank connections are temporarily unavailable.')
    }
  }
  async createLinkToken(actorId: string): Promise<{ linkToken: string }> {
    const result = z.object({ link_token: z.string().min(1).max(500) }).parse(
      await this.request('/link/token/create', {
        user: { client_user_id: actorId },
        client_name: 'Umunara',
        products: ['transactions'],
        country_codes: ['US'],
        language: 'en',
        account_filters: { depository: { account_subtypes: ['checking', 'savings'] } },
      })
    )
    return { linkToken: result.link_token }
  }
  async exchangePublicToken(publicToken: string): Promise<{ itemId: string; accessToken: string }> {
    const result = z
      .object({ item_id: identifier, access_token: z.string().min(1).max(1000) })
      .parse(await this.request('/item/public_token/exchange', { public_token: publicToken }))
    return { itemId: result.item_id, accessToken: result.access_token }
  }
  async getSelectedAccounts(
    accessToken: string,
    selectedAccountIds: string[]
  ): Promise<{ institutionName: string; accounts: BankConnectionAccount[] }> {
    // Read trusted metadata on the server; never accept account names or masks from Link callbacks.
    const result = accountsResponse.parse(
      await this.request('/accounts/get', {
        access_token: accessToken,
        options: { account_ids: selectedAccountIds },
      })
    )
    if (
      result.accounts.length !== selectedAccountIds.length ||
      new Set(result.accounts.map((a) => a.account_id)).size !== selectedAccountIds.length ||
      result.accounts.some((a) => !selectedAccountIds.includes(a.account_id))
    )
      throw new Error('Invalid account selection.')
    const accounts = result.accounts.map((account) =>
      bankConnectionAccountSchema.parse({
        providerAccountId: account.account_id,
        name: account.name,
        mask: account.mask && /^[0-9]{2,4}$/.test(account.mask) ? account.mask : null,
        type: account.type,
        subtype: account.subtype,
        currency: account.balances.iso_currency_code,
      })
    )
    const institution = z
      .object({
        institution: z.object({
          name: z.string().trim().min(1).max(200),
          country_codes: z.array(z.string()),
        }),
      })
      .parse(
        await this.request('/institutions/get_by_id', {
          institution_id: result.item.institution_id,
          country_codes: ['US'],
        })
      )
    if (!institution.institution.country_codes.includes('US'))
      throw new Error('Unsupported bank country.')
    return { institutionName: institution.institution.name, accounts }
  }
  async removeItem(accessToken: string): Promise<void> {
    await this.request('/item/remove', { access_token: accessToken })
  }
}
