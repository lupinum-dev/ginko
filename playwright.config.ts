import { defineConfig } from '@playwright/test'

// Site end-to-end tests: the built restaurant site against the fake platform (e2e/fake-platform.mjs).
// Build first: pnpm --filter './sites/*' build
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  use: { baseURL: 'http://localhost:3201' },
  projects: [
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    { command: 'node e2e/fake-platform.mjs', port: 3999, reuseExistingServer: false },
    { command: 'node sites/restaurant/.output/server/index.mjs', port: 3201, reuseExistingServer: false, env: { PORT: '3201', NUXT_PUBLIC_GINKO_PLATFORM: 'http://localhost:3999' } },
    { command: 'node sites/industrie/.output/server/index.mjs', port: 3202, reuseExistingServer: false, env: { PORT: '3202', NUXT_PUBLIC_GINKO_PLATFORM: 'http://localhost:3999' } },
    { command: 'node sites/saas/.output/server/index.mjs', port: 3203, reuseExistingServer: false, env: { PORT: '3203', NUXT_PUBLIC_GINKO_PLATFORM: 'http://localhost:3999' } },
    // Files only (CONTENT.md): never asks the platform.
    { command: 'node sites/docs/.output/server/index.mjs', port: 3204, reuseExistingServer: false, env: { PORT: '3204' } },
  ],
})
