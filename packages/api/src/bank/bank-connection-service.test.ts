import { beforeEach, expect, it, vi } from 'vitest'
import type { Actor } from '../auth/require-user'
import type { BankConnectionAccount, BankConnectionDto } from '@umunara/schemas'
import { BankConnectionService } from './bank-connection-service'

vi.mock('server-only', () => ({}))
const id = '11111111-1111-4111-8111-111111111111'
const admin: Actor = { id, role: 'admin', approvedAt: '2026-01-01' }
const connection: BankConnectionDto = {
  id,
  institutionName: 'Fixture Bank',
  status: 'active',
  lastSyncedAt: null,
}
const account: BankConnectionAccount = {
  providerAccountId: 'account-1',
  name: 'Business checking',
  mask: '1234',
  type: 'depository',
  subtype: 'checking',
  currency: 'USD',
}
const provider = {
  createLinkToken: vi.fn(async () => ({ linkToken: 'link-fixture' })),
  exchangePublicToken: vi.fn(async () => ({
    itemId: 'item-private',
    accessToken: 'access-private',
  })),
  getSelectedAccounts: vi.fn(async () => ({
    institutionName: 'Fixture Bank',
    accounts: [account],
  })),
  removeItem: vi.fn(async () => {}),
}
const secrets = { save: vi.fn(async () => {}) }
const repository = { createConnection: vi.fn(async () => connection) }
const service = new BankConnectionService(provider, secrets, repository)
beforeEach(() => {
  vi.clearAllMocks()
})
it.each(['pending', 'member', 'editor'] as const)(
  'denies %s before touching provider or secrets',
  async (role) => {
    await expect(service.createLinkToken({ ...admin, role })).rejects.toMatchObject({ status: 403 })
    await expect(
      service.exchangePublicToken({ ...admin, role }, 'public-fixture', ['account-1'])
    ).rejects.toMatchObject({ status: 403 })
    expect(provider.createLinkToken).not.toHaveBeenCalled()
    expect(provider.exchangePublicToken).not.toHaveBeenCalled()
    expect(secrets.save).not.toHaveBeenCalled()
  }
)
it('denies anonymous and unapproved admins', async () => {
  await expect(service.createLinkToken(null)).rejects.toMatchObject({ status: 401 })
  await expect(service.createLinkToken({ ...admin, approvedAt: null })).rejects.toMatchObject({
    status: 403,
  })
})
it('creates an admin Link token and persists only a secret reference and verified account metadata', async () => {
  expect(await service.createLinkToken(admin)).toEqual({ linkToken: 'link-fixture' })
  expect(provider.createLinkToken).toHaveBeenCalledWith(id)
  expect(await service.exchangePublicToken(admin, 'public-fixture', ['account-1'])).toEqual(
    connection
  )
  expect(secrets.save).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ itemId: 'item-private', accessToken: 'access-private' })
  )
  expect(repository.createConnection).toHaveBeenCalledWith(
    expect.objectContaining({
      actorId: id,
      secretReference: expect.any(String),
      accounts: [account],
    })
  )
  expect(JSON.stringify(repository.createConnection.mock.calls)).not.toMatch(
    /access-private|item-private|public-fixture/
  )
})
it('masks token exchange failures without writing storage', async () => {
  provider.exchangePublicToken.mockRejectedValueOnce(new Error('access-private public-fixture'))
  await expect(
    service.exchangePublicToken(admin, 'public-fixture', ['account-1'])
  ).rejects.toMatchObject({
    status: 503,
    message: 'Unable to connect the bank account. Please try again later.',
  })
  expect(secrets.save).not.toHaveBeenCalled()
  expect(repository.createConnection).not.toHaveBeenCalled()
})
it('revokes an exchanged item if verification or secure storage fails', async () => {
  secrets.save.mockRejectedValueOnce(new Error('vault-private'))
  await expect(
    service.exchangePublicToken(admin, 'public-fixture', ['account-1'])
  ).rejects.toMatchObject({ status: 503 })
  expect(provider.removeItem).toHaveBeenCalledWith('access-private')
  expect(repository.createConnection).not.toHaveBeenCalled()
})
it('retains the secret after an ambiguous database failure for recovery', async () => {
  repository.createConnection.mockRejectedValueOnce(new Error('database-private'))
  await expect(
    service.exchangePublicToken(admin, 'public-fixture', ['account-1'])
  ).rejects.toMatchObject({ status: 503 })
  expect(provider.removeItem).not.toHaveBeenCalled()
})
it('rejects malformed or duplicate selection before exchange', async () => {
  await expect(service.exchangePublicToken(admin, 'public-fixture', [])).rejects.toThrow()
  await expect(service.exchangePublicToken(admin, 'public-fixture', ['a', 'a'])).rejects.toThrow()
  expect(provider.exchangePublicToken).not.toHaveBeenCalled()
})
