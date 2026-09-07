import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('registration confirms email, shows pending approval, and supports password sign-in and sign-out', async ({
  page,
  context,
}) => {
  const browserDataRequests: string[] = []
  page.on('request', (request) => {
    if (['fetch', 'xhr'].includes(request.resourceType())) browserDataRequests.push(request.url())
  })
  await page.goto('/member')
  await expect(page).toHaveURL(/\/sign-in$/)
  await page.getByRole('link', { name: 'Create an account' }).click()
  await page.getByLabel('Full name').fill('New member')
  await page.getByLabel('Email', { exact: true }).fill('new@example.test')
  await page.getByLabel('Password', { exact: true }).fill('test-password-123')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  expect((await context.cookies()).some((cookie) => cookie.name.endsWith('-auth-token'))).toBe(
    false,
  )
  await page.goto('/api/v1/auth/confirm?token_hash=valid-email-token&type=email')
  await expect(page).toHaveURL(/\/account$/)
  await expect(page.getByRole('heading', { name: 'Awaiting membership approval' })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  expect((await context.cookies()).some((cookie) => cookie.name.endsWith('-auth-token'))).toBe(
    false,
  )
  await page.getByLabel('Email', { exact: true }).fill('new@example.test')
  await page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Unable to sign in')
  await page.getByLabel('Password', { exact: true }).fill('test-password-123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Awaiting membership approval' })).toBeVisible()
  await page.goto('/member/resources')
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible()
  expect(browserDataRequests.some((url) => url.includes('/api/v1/auth/sign-up'))).toBe(true)
  expect(browserDataRequests.some((url) => url.includes(':55431'))).toBe(false)
})

test('immediate signup sessions still lead to pending approval and invalid confirmations show an error', async ({
  page,
}) => {
  await page.goto('/sign-up')
  await page.getByLabel('Full name').fill('Immediate account')
  await page.getByLabel('Email', { exact: true }).fill('immediate@example.test')
  await page.getByLabel('Password', { exact: true }).fill('test-password-123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Awaiting membership approval' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await page.goto('/api/v1/auth/confirm?token_hash=expired&type=email')
  await expect(page.getByRole('main').getByRole('alert')).toContainText('invalid or expired')
})
