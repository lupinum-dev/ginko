import { defineConfig } from '@playwright/test'

// Platform UI tests (UI.md 9) against the LOCAL Convex backend with real mutations and sign-in.
// Needs `pnpm --filter @ginko/platform convex` running (local, anonymous; it writes packages/ginko-server/.env.local).
// The platform and the restaurant site (for the preview) are started here if not running.
// One worker: all tests share one backend and reset its content.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 60_000,
  globalSetup: './e2e/global-setup.ts',
  // German browser: the Studio follows Accept-Language (ginko_locale cookie, then browser, then English), and these tests read German texts.
  use: { baseURL: 'http://localhost:3100', locale: 'de-DE', trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    { command: 'pnpm run dev', port: 3100, reuseExistingServer: true, timeout: 120_000 },
    // The preview iframe loads the site from the origin the local devPush registers (http://localhost:3000).
    { command: 'pnpm exec nuxt dev --port 3000', cwd: '../../sites/restaurant', port: 3000, reuseExistingServer: true, timeout: 120_000, env: { NUXT_IGNORE_LOCK: '1' } },
  ],
})
