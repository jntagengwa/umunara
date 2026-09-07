import { expect, test, type BrowserContext } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function signIn(context: BrowserContext, role: 'pending' | 'member' | 'editor' | 'admin') {
  const token = [
    'eyJhbGciOiJIUzI1NiJ9',
    Buffer.from(
      JSON.stringify({
        sub: '11111111-1111-4111-8111-111111111111',
        exp: Math.floor(Date.now() / 1000) + 3600,
        testRole: role,
      }),
    ).toString('base64url'),
    'test-signature',
  ].join('.')
  const session = {
    access_token: token,
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: '11111111-1111-4111-8111-111111111111' },
  }
  await context.addCookies([
    {
      name: 'sb-127-auth-token',
      value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,
      domain: 'localhost',
      path: '/',
    },
  ])
}

test.beforeEach(async ({ page, context }) => {
  await page.route('https://www.podbean.com/**', (route) => route.abort())
  await signIn(context, 'editor')
  const reset = await context.request.put('/api/v1/site-settings/home-hero', {
    data: {
      value: {
        heading: 'Welcome To Umunara, Inc',
        introduction: 'We are glad you took some time out of your busy schedule to check on us.',
      },
    },
  })
  expect(reset.ok()).toBe(true)
  await context.clearCookies()
})

test('public pages preserve imagery, content and responsive accessible navigation', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome To Umunara, Inc' })).toBeVisible()
  await expect(page.getByAltText('Umunara community gathering')).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.setViewportSize({ width: 390, height: 844 })
  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  await expect(page.getByRole('link', { name: 'Blog', exact: true })).toBeHidden()
  await menu.click()
  await page.getByRole('link', { name: 'Blog', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A community of prayer' })).toBeVisible()
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
  await menu.click()
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.goto('/calendar')
  await expect(page).toHaveURL(/\/events$/)
  await expect(page.getByRole('heading', { name: 'Friday prayer' })).toBeVisible()
  await page.goto('/donate')
  await expect(page).toHaveURL(/\/give$/)
  await expect(page.getByRole('heading', { name: 'Donate', exact: true })).toBeVisible()
})

test('private routes deny anonymous and pending users, and restrict the CMS to editors', async ({
  page,
  context,
}) => {
  for (const route of ['/admin', '/admin/content', '/member']) {
    await page.goto(route)
    await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible()
  }
  await signIn(context, 'pending')
  await page.goto('/member')
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible()
  await signIn(context, 'member')
  await page.goto('/member')
  await expect(page.getByRole('heading', { name: 'Member prayer notes' })).toBeVisible()
  await page.goto('/admin/content')
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible()
  await signIn(context, 'pending')
  await page.goto('/member')
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible()
})

test('editor saves only home content, sees feedback, and public cached hero refreshes', async ({
  page,
  context,
  request,
}) => {
  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Friday prayer' })).toBeVisible()
  await signIn(context, 'editor')
  await page.goto('/admin/content')
  await expect(page.getByRole('heading', { name: 'Home content', exact: true })).toBeVisible()
  await expect(page.getByLabel('Hero heading')).toHaveValue('Welcome To Umunara, Inc')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await request.delete('http://127.0.0.1:55431/__test/requests')
  const apiRequests: string[] = []
  page.on('request', (entry) => {
    if (entry.url().includes('/api/')) apiRequests.push(entry.url())
  })
  await page.getByLabel('Hero heading').fill('Prayer for every nation')
  await page.getByRole('button', { name: 'Save home content' }).click()
  await expect(page.getByRole('status')).toHaveText('Home content saved.')
  expect(apiRequests).toEqual(['http://localhost:55430/api/v1/site-settings/home-hero'])
  const savedRequests: { path: string }[] = await (
    await request.get('http://127.0.0.1:55431/__test/requests')
  ).json()
  expect(savedRequests.some((entry) => entry.path.endsWith('/events'))).toBe(false)
  await context.clearCookies()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Prayer for every nation' })).toBeVisible()
  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Friday prayer' })).toBeVisible()
  const afterRead: { path: string; query: string }[] = await (
    await request.get('http://127.0.0.1:55431/__test/requests')
  ).json()
  expect(afterRead.some((entry) => entry.path.endsWith('/events'))).toBe(false)
  expect(
    afterRead.some(
      (entry) =>
        entry.path.endsWith('/site_settings') && entry.query === '?select=value&key=eq.home-hero',
    ),
  ).toBe(true)
})
