import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { signIn } from './fixtures/session'

test('only approved admins can access the bank page and connection endpoints', async ({
  page,
  context,
}) => {
  await page.goto('/admin/bank')
  await expect(page).toHaveURL(/\/sign-in$/)
  for (const role of ['pending', 'member', 'editor'] as const) {
    await signIn(context, role)
    expect(
      (
        await context.request.post('/api/v1/admin/bank/link-token', {
          data: { businessAccountConsent: true },
        })
      ).status()
    ).toBe(403)
    expect(
      (await context.request.post('/api/v1/admin/bank/exchange-token', { data: {} })).status()
    ).toBe(403)
    await page.goto('/admin/bank')
    await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible()
  }
})
for (const failed of [false, true]) {
  test(`admin consent and account selection ${failed ? 'handles exchange failure' : 'connects with safe metadata'}`, async ({
    page,
    context,
  }) => {
    await signIn(context, 'admin')
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('https://cdn.plaid.com/link/v2/stable/link-initialize.js', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `window.Plaid = { create: function(options) { return { open: function() { options.onSuccess('${failed ? 'public-failure' : 'public-fixture'}', { accounts: [{ id: 'a1', name: 'Business checking', mask: '1234', type: 'depository', subtype: 'checking' }] }); }, destroy: function() {} }; } };`,
      })
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/admin/bank')
    await expect(page.getByRole('button', { name: 'Connect bank account' })).toBeDisabled()
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Connect bank account' }).click()
    await expect(page.getByRole('button', { name: 'Connect selected accounts' })).toBeDisabled()
    await page.getByRole('checkbox', { name: /Business checking/ }).check()
    expect((await new AxeBuilder({ page }).include('section').analyze()).violations).toEqual([])
    const result = page.waitForResponse((response) => response.url().endsWith('/exchange-token'))
    await page.getByRole('button', { name: 'Connect selected accounts' }).click()
    const response = await result
    expect(response.status()).toBe(failed ? 503 : 201)
    const body = failed
      ? await (
          await context.request.post('/api/v1/admin/bank/exchange-token', {
            data: {
              businessAccountConsent: true,
              publicToken: 'public-failure',
              selectedAccountIds: ['a1'],
            },
          })
        ).text()
      : await response.text()
    expect(body).not.toMatch(/access-private|item-private|secretReference|public-fixture/)
    await expect(page.locator('section').getByRole(failed ? 'alert' : 'status')).toContainText(
      failed ? 'Contact an administrator' : 'Fixture Bank connected'
    )
    expect(await page.locator('body').innerText()).not.toMatch(
      /access-private|item-private|public-fixture|link-fixture/
    )
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true)
    expect(errors).toEqual([])
  })
}
