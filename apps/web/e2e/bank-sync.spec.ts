import { expect, test } from '@playwright/test'

test('production routes verify webhooks and run only secret-authorized cursor sync', async ({
  request,
}) => {
  const connectionId = '71000000-0000-4000-8000-000000000001'
  const headers = { authorization: 'Bearer fixture-separate-sync-secret-32-characters' }
  await request.post('http://127.0.0.1:55431/__test/bank-sync/reset')
  expect(
    (await request.post('/api/v1/internal/bank/sync', { data: { connectionId } })).status()
  ).toBe(401)
  const initial = await request.post('/api/v1/internal/bank/sync', {
    data: { connectionId },
    headers,
  })
  expect(initial.status()).toBe(200)
  expect(await initial.json()).toEqual({ added: 1, modified: 1, removed: 1 })
  const signed = await (await request.post('http://127.0.0.1:55431/__test/bank-sync/sign')).json()
  for (let index = 0; index < 2; index++) {
    const webhook = await request.post('/api/v1/webhooks/plaid', {
      data: signed.rawBody,
      headers: { 'Content-Type': 'application/json', 'Plaid-Verification': signed.token },
    })
    expect(webhook.status()).toBe(200)
    expect(await webhook.json()).toEqual({ received: true })
  }
  expect(await (await request.get('http://127.0.0.1:55431/__test/bank-sync/stats')).json()).toEqual(
    { cursor: 'cursor-2', pending: true, applied: 2, events: 1 }
  )
  expect(
    (
      await request.post('/api/v1/webhooks/plaid', {
        data: `${signed.rawBody} `,
        headers: { 'Content-Type': 'application/json', 'Plaid-Verification': signed.token },
      })
    ).status()
  ).toBe(401)
  const update = await request.post('/api/v1/internal/bank/sync', {
    data: { connectionId },
    headers,
  })
  expect(await update.json()).toEqual({ added: 0, modified: 0, removed: 0 })
  expect(await update.text()).not.toMatch(/sync-access-private|secretReference|sync-item-fixture/)
})
