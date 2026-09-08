import { expect, test, type APIRequestContext } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createHmac } from 'node:crypto'
import { signIn } from './fixtures/session'

function payPalSender(request: APIRequestContext) {
  return (id: string, type: string, resource: unknown, at: string) => {
    const raw = JSON.stringify({ id, event_type: type, create_time: at, resource })
    return request.post('/api/v1/webhooks/paypal', {
      data: raw,
      headers: {
        'paypal-auth-algo': 'SHA256withRSA',
        'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT123',
        'paypal-transmission-id': 'report-transmission',
        'paypal-transmission-time': at,
        'paypal-transmission-sig': createHmac('sha256', 'paypal-fixture-verification')
          .update(raw)
          .digest('hex'),
      },
    })
  }
}

test('restricts reporting pages and APIs to approved admins', async ({ page, context }) => {
  await page.goto('/admin/donations')
  await expect(page).toHaveURL(/\/sign-in$/)
  for (const role of ['pending', 'member', 'editor'] as const) {
    await signIn(context, role)
    expect((await context.request.get('/api/v1/admin/donations/summary')).status()).toBe(403)
    await page.goto('/admin/donations')
    await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible()
  }
})

test('caches aggregates and refreshes current and comparison periods after verified webhooks only', async ({
  page,
  context,
  request,
}) => {
  // Next's persistent cache survives server restarts. Applied zero-recognized
  // attempts expire these months through the real webhook path before each run.
  await request.delete('http://127.0.0.1:55431/__test/paypal-ledger')
  for (const month of ['01', '09']) {
    const at = `2026-${month}-15T12:00:00Z`
    expect(
      (
        await payPalSender(request)(
          `reset-${month}`,
          'PAYMENT.CAPTURE.DECLINED',
          {
            id: `RESET${month}`,
            status: 'DECLINED',
            create_time: at,
            update_time: at,
            amount: { value: '25.00', currency_code: 'USD' },
            supplementary_data: { related_ids: { order_id: 'ORDER123' } },
          },
          at
        )
      ).status()
    ).toBe(200)
  }
  await request.delete('http://127.0.0.1:55431/__test/donation-reporting')
  await request.delete('http://127.0.0.1:55431/__test/donation-ledger')
  await signIn(context, 'admin')
  const read = async (from: string, to: string) => {
    const response = await context.request.get(
      `/api/v1/admin/donations/summary?from=${from}&to=${to}&currency=USD`
    )
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toBe('private, no-store')
    return response.json()
  }
  const counters = async () =>
    (await (await request.get('http://127.0.0.1:55431/__test/donation-reporting')).json()) as {
      report_from: string
    }[]
  expect((await read('2026-09-01', '2026-09-30')).netAmountMinor).toBe(0)
  await read('2026-09-01', '2026-09-30')
  await read('2026-10-01', '2026-10-31')
  await read('2026-01-01', '2026-01-31')
  expect(await counters()).toHaveLength(3)
  const raw = JSON.stringify({
    id: 'evt_report',
    type: 'payment_intent.succeeded',
    created: 1788825660,
    livemode: false,
    api_version: '2026-08-26.dahlia',
    data: { object: { id: 'pi_fixture' } },
  })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = `t=${timestamp},v1=${createHmac('sha256', 'whsec_fixture_only').update(`${timestamp}.${raw}`).digest('hex')}`
  const send = (data: string) =>
    request.post('/api/v1/webhooks/stripe', {
      data,
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
    })
  expect((await send(raw + ' ')).status()).toBe(400)
  expect((await read('2026-09-01', '2026-09-30')).netAmountMinor).toBe(0)
  expect(await counters()).toHaveLength(3)
  expect((await send(raw)).status()).toBe(200)
  expect((await read('2026-09-01', '2026-09-30')).netAmountMinor).toBe(2450)
  expect((await read('2026-10-01', '2026-10-31')).comparison.netAmountMinor).toBe(2450)
  await read('2026-01-01', '2026-01-31')
  expect(await counters()).toHaveLength(5)
  expect((await send(raw)).status()).toBe(200)
  await read('2026-09-01', '2026-09-30')
  expect(await counters()).toHaveLength(5)

  const browserRequests: string[] = []
  page.on('request', (entry) => {
    if (entry.url().includes('/rest/v1/')) browserRequests.push(entry.url())
  })
  await page.goto('/admin/donations')
  await page.getByLabel('From', { exact: true }).fill('2026-09-01')
  await page.getByLabel('To', { exact: true }).fill('2026-09-30')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page.getByLabel('Net giving', { exact: true })).toHaveText('$24.50')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  )
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  expect(browserRequests).toEqual([])
  await page.getByLabel('Currency', { exact: true }).fill('GBP')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page.getByText(/No settled gifts/)).toBeVisible()
  await page.route('**/api/v1/admin/donations/summary?**', (route) =>
    route.fulfill({ status: 503, json: { error: 'Unavailable' } })
  )
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Try again')
  await expect(page.getByLabel('Net giving', { exact: true })).toHaveCount(0)
  await page.unroute('**/api/v1/admin/donations/summary?**')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page.getByText(/No settled gifts/)).toBeVisible()
  await signIn(context, 'editor')
  expect(
    (
      await context.request.get(
        '/api/v1/admin/donations/summary?from=2026-09-01&to=2026-09-30&currency=USD'
      )
    ).status()
  ).toBe(403)
})

test('a later PayPal reversal refreshes the original receipt month and keeps retained fees negative', async ({
  context,
  request,
}) => {
  await request.delete('http://127.0.0.1:55431/__test/paypal-ledger')
  await signIn(context, 'admin')
  const money = (value: string) => ({ value, currency_code: 'USD' })
  const send = payPalSender(request)
  const read = async (from: string, to: string) => {
    const response = await context.request.get(
      `/api/v1/admin/donations/summary?from=${from}&to=${to}`
    )
    expect(response.status()).toBe(200)
    return response.json()
  }
  expect(
    (
      await send(
        'report-capture',
        'PAYMENT.CAPTURE.COMPLETED',
        {
          id: 'CAPTURE123',
          status: 'COMPLETED',
          amount: money('25.00'),
          update_time: '2030-01-15T12:00:00Z',
          seller_receivable_breakdown: { paypal_fee: money('1.00'), net_amount: money('24.00') },
          supplementary_data: { related_ids: { order_id: 'ORDER123' } },
        },
        '2030-01-15T12:01:00Z'
      )
    ).status()
  ).toBe(200)
  expect((await read('2030-01-01', '2030-01-31')).netAmountMinor).toBe(2400)
  expect((await read('2030-02-01', '2030-02-28')).comparison.netAmountMinor).toBe(2400)
  expect(
    (
      await send(
        'report-reversal',
        'PAYMENT.CAPTURE.REVERSED',
        {
          id: 'REVERSAL123',
          status: 'COMPLETED',
          amount: money('25.00'),
          seller_payable_breakdown: {
            total_refunded_amount: money('25.00'),
            paypal_fee: money('0.00'),
          },
          links: [
            { rel: 'up', href: 'https://api.sandbox.paypal.com/v2/payments/captures/CAPTURE123' },
          ],
        },
        '2030-03-01T12:00:00Z'
      )
    ).status()
  ).toBe(200)
  expect(await read('2030-01-01', '2030-01-31')).toMatchObject({
    giftCount: 1,
    grossAmountMinor: 2500,
    feeAmountMinor: 100,
    refundedAmountMinor: 2500,
    netAmountMinor: -100,
  })
  expect((await read('2030-02-01', '2030-02-28')).comparison.netAmountMinor).toBe(-100)
  expect((await read('2030-03-01', '2030-03-31')).giftCount).toBe(0)
})
