import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createHmac } from 'node:crypto'

test('creates an order, returns from approval, and explicitly submits server capture', async ({
  page,
  context,
}) => {
  await page.route('https://www.sandbox.paypal.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>PayPal approval fixture</h1>' })
  )
  await page.goto('/give')
  const creation = page.waitForResponse('/api/v1/donations/paypal/order')
  await page.getByRole('button', { name: 'Continue to PayPal' }).click()
  expect((await creation).status()).toBe(201)
  await expect(page).toHaveURL('https://www.sandbox.paypal.com/checkoutnow?token=ORDER123')
  const cookie = (
    await context.cookies('http://localhost:55430/api/v1/donations/paypal/order')
  ).find((cookie) => cookie.name === 'umunara_paypal_capture')
  expect(cookie?.httpOnly).toBe(true)
  await page.goto('/give?paypal=approved&token=ORDER123')
  await expect(
    page.getByText('Your donation is recorded after PayPal confirms the payment.', { exact: false })
  ).toBeVisible()
  const capture = page.waitForResponse('/api/v1/donations/paypal/order/ORDER123/capture')
  await page.getByRole('button', { name: 'Complete PayPal donation' }).click()
  expect((await capture).status()).toBe(200)
  await expect(
    page.getByRole('region', { name: 'PayPal giving' }).getByRole('status')
  ).toContainText('submitted')
})

for (const cadence of ['monthly', 'yearly']) {
  test(`creates a ${cadence} subscription through the application API`, async ({ page }) => {
    await page.route('https://www.sandbox.paypal.com/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<h1>PayPal recurring approval fixture</h1>',
      })
    )
    await page.goto('/give')
    await page.getByLabel('PayPal giving frequency').selectOption(cadence)
    const response = page.waitForResponse('/api/v1/donations/paypal/subscription')
    await page.getByRole('button', { name: 'Continue to PayPal' }).click()
    expect((await response).status()).toBe(201)
    await expect(page).toHaveURL(/sandbox\.paypal\.com\/webapps\/billing/)
  })
}

test('handles cancelled approval, mobile errors and accessible giving controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/give?paypal=cancelled')
  await expect(page.getByText('PayPal checkout was cancelled.', { exact: false })).toBeVisible()
  await page.route('**/api/v1/donations/paypal/order', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"PayPal is temporarily unavailable."}',
    })
  )
  await page.getByRole('button', { name: 'Continue to PayPal' }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('temporarily unavailable')
  await expect(page.getByRole('button', { name: 'Continue to PayPal' })).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  )
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test('verifies raw webhooks and preserves one gift across duplicates, refunds, reversal and failed renewals', async ({
  request,
}) => {
  await request.delete('http://127.0.0.1:55431/__test/paypal-ledger')
  const money = (value: string) => ({ value, currency_code: 'USD' })
  const send = async (type: string, resource: unknown, id = type, valid = true) => {
    const raw = ` {"id":"${id}","event_type":"${type}","create_time":"2026-10-02T12:01:00Z","resource":${JSON.stringify(resource)}}\n`
    return request.post('/api/v1/webhooks/paypal', {
      data: raw,
      headers: {
        'paypal-auth-algo': 'SHA256withRSA',
        'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT123',
        'paypal-transmission-id': 'transmission123',
        'paypal-transmission-time': '2026-10-02T12:00:00Z',
        'paypal-transmission-sig': valid
          ? createHmac('sha256', 'paypal-fixture-verification').update(raw).digest('hex')
          : 'invalid',
      },
    })
  }
  const capture = {
    id: 'CAPTURE123',
    status: 'COMPLETED',
    amount: money('25.00'),
    update_time: '2026-10-02T12:00:00Z',
    seller_receivable_breakdown: { paypal_fee: money('1.00'), net_amount: money('24.00') },
    supplementary_data: { related_ids: { order_id: 'ORDER123' } },
  }
  expect((await send('PAYMENT.CAPTURE.COMPLETED', capture, 'invalid', false)).status()).toBe(400)
  expect((await send('PAYMENT.CAPTURE.COMPLETED', capture)).status()).toBe(200)
  expect((await send('PAYMENT.CAPTURE.COMPLETED', capture)).status()).toBe(200)
  const refund = {
    id: 'REFUND123',
    status: 'COMPLETED',
    seller_payable_breakdown: { total_refunded_amount: money('5.00'), paypal_fee: money('0.00') },
    links: [
      { rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE123' },
    ],
  }
  expect((await send('PAYMENT.CAPTURE.REFUNDED', refund)).status()).toBe(200)
  expect((await send('PAYMENT.CAPTURE.REVERSED', { id: 'CAPTURE123' })).status()).toBe(200)
  expect(
    (
      await send('BILLING.SUBSCRIPTION.PAYMENT.FAILED', {
        id: 'I-SUB123',
        billing_info: {
          last_failed_payment: { amount: money('25.00'), time: '2026-09-30T23:00:00Z' },
        },
      })
    ).status()
  ).toBe(200)
  const result = await (await request.get('http://127.0.0.1:55431/__test/paypal-ledger')).json()
  expect(result).toMatchObject({ events: 4, applications: 4 })
  expect(result.projections).toHaveLength(2)
  expect(result.projections[0]).toMatchObject({
    receivedAt: '2026-10-02T12:00:00.000Z',
    donation: { status: 'reversed', netAmountMinor: -100 },
  })
  expect(result.projections[1].donation.status).toBe('failed')
})
