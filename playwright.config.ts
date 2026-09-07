import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:55430', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node apps/web/e2e/fixtures/supabase.mjs',
      url: 'http://127.0.0.1:55431/health',
      reuseExistingServer: false,
    },
    {
      command: 'npm exec --workspace @umunara/web -- next start --hostname localhost --port 55430',
      url: 'http://localhost:55430/give',
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55431',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-test-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'local-test-service-key',
      },
    },
  ],
})
