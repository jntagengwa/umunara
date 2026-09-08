import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { signIn } from './fixtures/session'

const payoutId = '71000000-0000-4000-8000-000000000001'
const giftId = '72000000-0000-4000-8000-000000000001'
const accountId = '11111111-1111-4111-8111-111111111111'
const base = '/api/v1/admin/bank/transactions'
test('bank review routes deny every nonadmin context', async ({ context }) => {
  expect((await context.request.get(`${base}?from=2026-09-01&to=2026-09-30`)).status()).toBe(401)
  for (const role of ['pending', 'member', 'editor'] as const) {
    await signIn(context, role)
    expect((await context.request.get(`${base}?from=2026-09-01&to=2026-09-30`)).status()).toBe(403)
    expect(
      (
        await context.request.post(`${base}/${payoutId}/classify`, {
          data: { classification: 'donation' },
        })
      ).status()
    ).toBe(403)
    expect(
      (
        await context.request.post(`${base}/${payoutId}/reconcile`, {
          data: { donationIds: [giftId] },
        })
      ).status()
    ).toBe(403)
  }
})
test('admin filters, confirms and reconciles a payout without increasing giving', async ({
  page,
  context,
}) => {
  await context.request.delete('http://127.0.0.1:55431/__test/bank-review')
  await signIn(context, 'admin')
  const summaryUrl = '/api/v1/admin/donations/summary?from=2026-09-01&to=2026-09-30&currency=USD'
  const before = await (await context.request.get(summaryUrl)).json()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin/bank')
  const review = page.getByRole('region', { name: 'Bank transaction review', exact: true })
  await expect(review.getByRole('table')).toBeVisible()
  await review.getByRole('button', { name: 'Next page' }).click()
  await expect(review.getByText('Bank charge 25', { exact: true })).toBeVisible()
  await expect(review.getByRole('button', { name: 'Next page' })).toBeDisabled()
  await review.getByLabel('Minimum amount (minor units)').fill('1')
  await review.getByLabel('Account ID').fill(accountId)
  await review
    .getByRole('combobox', { name: 'Classification', exact: true })
    .selectOption('unreviewed')
  await review.getByRole('button', { name: 'Apply filters' }).click()
  await expect(review.getByText('Stripe settlement', { exact: true })).toBeVisible()
  await expect(review.getByRole('row')).toHaveCount(2)
  await review.getByRole('button', { name: 'Review Stripe settlement' }).click()
  await review.getByLabel('Review action').selectOption('reconcile')
  await review.getByLabel('Donation IDs').fill(accountId)
  await expect(review.getByRole('button', { name: 'Confirm review' })).toBeDisabled()
  await review.getByLabel(/I confirm/).check()
  await review.getByRole('button', { name: 'Confirm review' }).click()
  await expect(review.getByRole('alert')).toContainText('cannot be changed or matched')
  await review.getByLabel('Donation IDs').fill(giftId)
  await expect(review.getByRole('button', { name: 'Confirm review' })).toBeDisabled()
  await review.getByLabel(/I confirm/).check()
  expect(
    (await new AxeBuilder({ page }).include('[aria-labelledby="bank-review-title"]').analyze())
      .violations
  ).toEqual([])
  await review.getByRole('button', { name: 'Confirm review' }).click()
  await expect(review.getByRole('status')).toContainText(
    'Review saved. Donation totals are unchanged.'
  )
  await expect(review.getByText('No transactions match these filters.')).toBeVisible()
  await review
    .getByRole('combobox', { name: 'Classification', exact: true })
    .selectOption('processor_payout')
  await review.getByRole('button', { name: 'Apply filters' }).click()
  await expect(review.getByText('Processor payout · Matched to 1 gifts')).toBeVisible()
  const after = await (await context.request.get(summaryUrl)).json()
  expect(after).toEqual(before)
  expect(before.giftCount).toBeGreaterThan(0)
  const changed = await context.request.post(`${base}/${payoutId}/classify`, {
    data: { classification: 'donation' },
  })
  expect(changed.status()).toBe(409)
  expect(await changed.text()).not.toContain('private-provider-account')
  const state = await (
    await context.request.get('http://127.0.0.1:55431/__test/bank-review')
  ).json()
  expect(state.calls.some((call: { path: string }) => call.path.includes('donation'))).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
