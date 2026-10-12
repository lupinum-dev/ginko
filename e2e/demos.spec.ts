// Every static page of every demo site (from its schema's `pages`) against the fake platform: it renders,
// it stays on its own host (fonts self-hosted, no tracking), it sets no cookie, and it fits a phone.
import { expect, test } from '@playwright/test'
import restaurant from '../sites/restaurant/ginko.config.ts'
import industrie from '../sites/industrie/ginko.config.ts'
import saas from '../sites/saas/ginko.config.ts'
import docs from '../sites/docs/ginko.config.ts'

const demos = [
  { site: restaurant, origin: 'http://localhost:3201' },
  { site: industrie, origin: 'http://localhost:3202' },
  { site: saas, origin: 'http://localhost:3203' },
  { site: docs, origin: 'http://localhost:3204' },
]

for (const { site, origin } of demos) {
  test(`${site.site}: every page renders on its own host, without cookies or overflow`, async ({ page, context }) => {
    // Up to 2 × 27 page loads (SaaS: 9 pages in 3 languages, with and without files).
    test.setTimeout(180_000)
    const foreign: string[] = []
    const errors: string[] = []
    page.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) foreign.push(r.url()) })
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${page.url()}: ${m.text()}`) })
    // Also with every file missing (a removed upload, or demo data without files): a page never breaks on it.
    for (const mode of ['ok', 'nofiles']) {
      await page.request.get(`http://localhost:3999/__control?mode=${mode}`)
      for (const path of Object.values(site.pages).flatMap((page) => typeof page === 'string' ? [page] : Object.values(page))) {
        const response = await page.goto(origin + path, { waitUntil: 'networkidle' })
        expect(response?.status(), `${mode} ${path}`).toBe(200)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} overflows`).toBe(true)
        // Search engines need full addresses for the language alternates (Astra 11).
        const alternates = await page.locator('link[rel=alternate][hreflang]').evaluateAll((links) => links.map((l) => l.getAttribute('href')))
        expect(alternates.every((href) => href?.startsWith(site.url)), `${path} alternates`).toBe(true)
      }
    }
    expect(foreign).toEqual([])
    expect(errors).toEqual([])
    expect(await context.cookies()).toEqual([])
  })
}
