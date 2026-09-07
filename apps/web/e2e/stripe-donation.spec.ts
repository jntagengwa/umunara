import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createHmac } from 'node:crypto'

test('starts a monthly gift through the real application API and navigates to hosted checkout', async ({
  page,
}) => {
  await page.route('https://checkout.stripe.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Hosted checkout fixture</h1>' })
  )
  const browserCalls: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST') browserCalls.push(request.url())
  })
  await page.goto('/give')
  await page.getByLabel('Donation amount (USD)').fill('25.50')
  await page.getByLabel('Giving frequency').selectOption('monthly')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  const response = page.waitForResponse('/api/v1/donations/stripe/checkout')
  await page.getByRole('button', { name: 'Continue to Stripe' }).click()
  expect((await response).status()).toBe(201)
  await expect(page).toHaveURL('https://checkout.stripe.com/c/pay/cs_fixture')
  expect(browserCalls).toEqual(['http://localhost:55430/api/v1/donations/stripe/checkout'])
})

test('shows recoverable errors, works on mobile, and never calls a return a confirmed donation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/give?checkout=returned')
  await expect(page.getByText(/confirmed by the payment provider/)).toBeVisible()
  await page.route('**/api/v1/donations/stripe/checkout', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Checkout is temporarily unavailable. Please try again later.',
      }),
    })
  )
  await page.getByLabel('Donation amount (USD)').fill('20')
  await page.getByRole('button', { name: 'Continue to Stripe' }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('temporarily unavailable')
  await expect(page.getByRole('button', { name: 'Continue to Stripe' })).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  )
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test('verifies a raw provider webhook through the deployed route and applies duplicate deliveries once', async ({
  request,
}) => {
  await request.delete('http://127.0.0.1:55431/__test/donation-ledger')
  const raw = JSON.stringify({
    id: 'evt_fixture',
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
  expect((await send(raw)).status()).toBe(200)
  expect((await send(raw)).status()).toBe(200)
  expect(await (await request.get('http://127.0.0.1:55431/__test/donation-ledger')).json()).toEqual(
    { events: 1, applications: 1 }
  )
})
