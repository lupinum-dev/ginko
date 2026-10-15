import { defineConfig } from '@playwright/test'

// The template gates 3–6 (spec TEMPLATES.md §9), started by `pnpm templates test <name>`, which builds the site, serves
// it on a free port and passes TEMPLATE_URL and the other TEMPLATE_* variables. Feature specs live in
// templates/_features/<feature>/e2e/ and run with gate 3.
export default defineConfig({
  testDir: '../..',
  testMatch: ['scripts/templates/e2e/*.spec.ts', 'templates/_features/*/e2e/*.spec.ts'],
  workers: 2,
  timeout: 120_000,
  reporter: 'list',
  use: {
    baseURL: process.env.TEMPLATE_URL,
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
  },
})
