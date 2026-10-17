import { defineConfig } from '@playwright/test'

// Gate 7 (spec TEMPLATES.md §9), started by `pnpm templates test <name> --platform`, which has the local Convex backend,
// the Studio (:3100) and the template site (:3000) running and passes TEMPLATE_* variables. Specs live in
// templates/_features/<feature>/e2e/studio/ (and templates/_studio/<template>/ for a template's own jobs) and run once, signed in as the
// platform admin. One worker: all specs share one backend.
export default defineConfig({
  testDir: '../..',
  testMatch: ['templates/_features/*/e2e/studio/*.spec.ts', 'templates/_studio/*/*.spec.ts'],
  workers: 1,
  // Both servers run in dev mode and compile a page on its first request: time for that on a busy machine.
  timeout: 150_000,
  expect: { timeout: 20_000 },
  reporter: 'list',
  globalSetup: './e2e/studio-setup.ts',
  // German browser, as the platform e2e: the Studio follows Accept-Language and its texts are read in German.
  use: { baseURL: process.env.TEMPLATE_STUDIO_URL, navigationTimeout: 60_000, locale: 'de-DE', browserName: 'chromium', viewport: { width: 1440, height: 900 }, storageState: process.env.TEMPLATE_AUTH, trace: 'retain-on-failure' },
})
