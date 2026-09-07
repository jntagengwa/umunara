import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { signIn } from './fixtures/session'

const pendingId = '22222222-2222-4222-8222-222222222222'

test('pending member gains private downloads and event registration after admin approval', async ({
  page,
  context,
  browser,
}) => {
  await signIn(context, 'pending', pendingId)
  for (const path of ['/member/resources', '/member/events', '/admin/members']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible()
  }
  const denied = await context.request.get(`/api/v1/resources/${pendingId}/download`)
  expect(denied.status()).toBe(403)
  expect(denied.headers()['cache-control']).toContain('no-store')

  const adminContext = await browser.newContext()
  await signIn(adminContext, 'admin')
  const adminPage = await adminContext.newPage()
  await adminPage.goto('http://localhost:55430/admin/members')
  await expect(adminPage.getByRole('heading', { name: 'Member approvals' })).toBeVisible()
  expect((await new AxeBuilder({ page: adminPage }).analyze()).violations).toEqual([])
  await adminPage.getByRole('button', { name: 'Approve member' }).click()
  await expect(adminPage.getByText('No members are awaiting approval.')).toBeVisible()
  await adminContext.close()

  // The pending session cookie is unchanged: the next request must read its new profile role.
  await page.goto('/member/resources')
  await expect(page.getByRole('heading', { name: 'Member prayer guide' })).toBeVisible()
  await page.getByRole('button', { name: 'Get download link' }).click()
  await expect(page.getByRole('link', { name: 'Download file' })).toHaveAttribute('href', /token=/)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.goto('/member/events')
  await expect(page.getByRole('heading', { name: 'Member prayer gathering' })).toBeVisible()
  await page.getByRole('button', { name: 'Register for event' }).click()
  await expect(page.getByRole('status')).toHaveText('You are registered for this event.')
})
