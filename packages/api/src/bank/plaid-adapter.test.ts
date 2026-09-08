import { afterEach, expect, it, vi } from 'vitest'
import { PlaidAdapter } from './plaid-adapter'

vi.mock('server-only', () => ({}))
afterEach(() => vi.unstubAllGlobals())
const adapter = new PlaidAdapter({
  clientId: 'client-fixture',
  secret: 'secret-fixture',
  environment: 'sandbox',
})
const accounts = {
  item: { institution_id: 'ins_1' },
  accounts: [
    {
      account_id: 'a1',
      name: 'Checking',
      mask: '1234',
      type: 'depository',
      subtype: 'checking',
      balances: { iso_currency_code: 'USD', current: 99999 },
      account_number: 'private-full-number',
    },
  ],
}
function mockFetch(...responses: unknown[]) {
  const fetch = vi.fn<typeof globalThis.fetch>()
  responses.forEach((response) => fetch.mockResolvedValueOnce(Response.json(response)))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
it('requests only US transaction access and checking/savings accounts with server credentials', async () => {
  const fetch = mockFetch({ link_token: 'link-fixture', request_id: 'private' })
  expect(await adapter.createLinkToken('admin-id')).toEqual({ linkToken: 'link-fixture' })
  const [url, init] = fetch.mock.calls[0]!
  expect(url).toBe('https://sandbox.plaid.com/link/token/create')
  expect(init).toMatchObject({
    cache: 'no-store',
    redirect: 'error',
    headers: { 'PLAID-SECRET': 'secret-fixture' },
  })
  expect(JSON.parse(String(init?.body))).toEqual({
    user: { client_user_id: 'admin-id' },
    client_name: 'Umunara',
    products: ['transactions'],
    country_codes: ['US'],
    language: 'en',
    account_filters: { depository: { account_subtypes: ['checking', 'savings'] } },
  })
})
it('exchanges the public token only on the server and returns normalized references', async () => {
  mockFetch({ item_id: 'item-fixture', access_token: 'access-fixture', request_id: 'discard' })
  expect(await adapter.exchangePublicToken('public-fixture')).toEqual({
    itemId: 'item-fixture',
    accessToken: 'access-fixture',
  })
})
it('projects verified selected account metadata without balances or account numbers', async () => {
  const fetch = mockFetch(accounts, {
    institution: { name: 'Fixture Bank', country_codes: ['US'] },
  })
  expect(await adapter.getSelectedAccounts('access-fixture', ['a1'])).toEqual({
    institutionName: 'Fixture Bank',
    accounts: [
      {
        providerAccountId: 'a1',
        name: 'Checking',
        mask: '1234',
        type: 'depository',
        subtype: 'checking',
        currency: 'USD',
      },
    ],
  })
  expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({
    access_token: 'access-fixture',
    options: { account_ids: ['a1'] },
  })
})
it('rejects invented selections, unsupported accounts and non-US institutions', async () => {
  mockFetch(accounts)
  await expect(adapter.getSelectedAccounts('access-fixture', ['not-a1'])).rejects.toThrow()
  mockFetch({ ...accounts, accounts: [{ ...accounts.accounts[0], type: 'credit' }] })
  await expect(adapter.getSelectedAccounts('access-fixture', ['a1'])).rejects.toThrow()
  mockFetch(accounts, { institution: { name: 'Bank', country_codes: ['CA'] } })
  await expect(adapter.getSelectedAccounts('access-fixture', ['a1'])).rejects.toThrow()
})
it('discards unsafe masks and never exposes a provider error body', async () => {
  mockFetch(
    { ...accounts, accounts: [{ ...accounts.accounts[0], mask: '123456789' }] },
    { institution: { name: 'Bank', country_codes: ['US'] } }
  )
  expect((await adapter.getSelectedAccounts('access-fixture', ['a1'])).accounts[0]?.mask).toBeNull()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ error: 'access-fixture' }, { status: 400 }))
  )
  await expect(adapter.exchangePublicToken('public-fixture')).rejects.toMatchObject({
    status: 503,
    message: 'Bank connections are temporarily unavailable.',
  })
})
