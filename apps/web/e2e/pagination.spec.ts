import { expect, test } from '@playwright/test'
import { signIn } from './fixtures/session'

test('approval of the last row on page 2 retains recovery to remaining approvals', async ({
  page,
  context,
}) => {
  await context.request.post('http://127.0.0.1:55431/__test/approval-pages')
  try {
    await signIn(context, 'admin')
    await page.goto('/admin/members?page=2')
    await page.getByRole('button', { name: 'Approve member' }).click()
    await expect(
      page.getByText(
        'No members on this page. Return to a previous page to see remaining approvals.',
      ),
    ).toBeVisible()
    await expect(page.getByText('No members are awaiting approval.')).toHaveCount(0)
    await page.getByRole('link', { name: 'Previous page' }).click()
    await expect(page).toHaveURL(/\/admin\/members\?page=1$/)
    await expect(page.getByRole('heading', { name: 'Earlier pending member' })).toBeVisible()
  } finally {
    await context.request.delete('http://127.0.0.1:55431/__test/approval-pages')
  }
})
