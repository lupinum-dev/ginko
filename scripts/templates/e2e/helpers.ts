// Shared by the gate specs: the site under test (TEMPLATE_* from `pnpm templates test`), its pages and the test clock.
import { test as base, type Page } from '@playwright/test'

export const site = {
  url: process.env.TEMPLATE_URL ?? '',
  name: process.env.TEMPLATE_NAME ?? '',
  mode: process.env.TEMPLATE_MODE ?? 'multi',
  locales: (process.env.TEMPLATE_LOCALES ?? 'en').split(','),
  shots: process.env.TEMPLATE_SHOTS ?? 'test-results/templates',
  now: process.env.GINKO_TEST_NOW ?? new Date().toISOString(),
  /** `timeZone`, `currency` and the main language (BCP 47) of the template's ginko.config.ts. */
  timeZone: process.env.TEMPLATE_TIME_ZONE ?? 'UTC',
  currency: process.env.TEMPLATE_CURRENCY ?? '',
  language: process.env.TEMPLATE_LANGUAGE ?? 'en',
  /** The sample email and phone of content/site.md (either may be missing). */
  contact: JSON.parse(process.env.TEMPLATE_CONTACT || '{}') as { email?: string; phone?: string },
}

/** Every test starts the browser clock at the test instant; it keeps running (T10: one instant on all clocks). */
export const test = base.extend<{ clocked: void }>({
  clocked: [async ({ page }, use) => {
    await page.clock.install({ time: new Date(site.now) })
    await use()
  }, { auto: true }],
})

/** At most this many pages per check: home, then the sitemap in its order. */
const MAX_PAGES = 40

/** The site's pages: the paths of its sitemap (also of a sitemap index), home first. */
export async function sitePages(): Promise<string[]> {
  const paths = new Set<string>(['/'])
  const read = async (url: string): Promise<void> => {
    const xml = await (await fetch(url)).text()
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!.replaceAll('&amp;', '&'))
    if (xml.includes('<sitemapindex')) {
      for (const loc of locs) await read(`${site.url}${new URL(loc).pathname}`)
    }
    else for (const loc of locs) paths.add(new URL(loc).pathname)
  }
  await read(`${site.url}/sitemap.xml`)
  return [...paths].slice(0, MAX_PAGES)
}

/** A path as a file name: `/` → `home`, `/posts/a` → `posts-a`. */
export const slugOf = (path: string) => path.replace(/^\/|\/$/g, '').replaceAll('/', '-') || 'home'

/** Loads a page and waits for fonts, so measurements and screenshots see the final text. */
export async function open(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  return response
}

/** The theme toggle, if the header has one: a button named for the theme, dark or light mode. */
export const themeToggle = (page: Page) => page.locator('header').getByRole('button', { name: /theme|dark|light|mode|farb|dunk|hell/i }).first()
/** The phone navigation's open button, if any: a header button that controls or expands something. */
export const navToggle = (page: Page) => page.locator('header button[aria-expanded], header button[aria-controls], header [aria-haspopup="dialog"]').first()

export { expect } from '@playwright/test'
