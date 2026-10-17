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
  /** The path of the imprint, from the content file with `legalType: imprint` ('' when the template has none). */
  imprint: process.env.TEMPLATE_IMPRINT ?? '',
  contact: JSON.parse(process.env.TEMPLATE_CONTACT || '{}') as { email?: string; phone?: string },
}

/** Every test starts the browser clock at the test instant; it keeps running (T10: one instant on all clocks). */
export const test = base.extend<{ clocked: void }>({
  clocked: [async ({ page }, use) => {
    await page.clock.install({ time: new Date(site.now) })
    await use()
  }, { auto: true }],
})

/** At most this many detail pages (children of a list page) per list, so every route pattern is seen without a page per entry. */
const DETAILS_PER_LIST = 3

/**
 * A sample of the paths that shows every route pattern: a path is a detail when its parent path is itself a page that is
 * neither `/` nor a locale root; the first DETAILS_PER_LIST details per parent are kept, and every other path. Order is kept.
 */
export function samplePages(paths: string[], locales: string[] = site.locales): string[] {
  const all = new Set(paths)
  const roots = new Set(['/', ...locales.map((l) => `/${l}`)])
  const seen = new Map<string, number>()
  return paths.filter((path) => {
    const parent = path.replace(/\/$/, '').replace(/\/[^/]*$/, '') || '/'
    if (parent === path || roots.has(parent) || !all.has(parent)) return true
    const count = (seen.get(parent) ?? 0) + 1
    seen.set(parent, count)
    return count <= DETAILS_PER_LIST
  })
}

/** The site's pages for screenshots and the heavier gates: the sitemap (also an index), home first, one sample per route pattern. */
export async function sitePages(): Promise<string[]> {
  return samplePages(await allPages())
}

/** Every path of the sitemap (no limit), home first. */
export async function allPages(): Promise<string[]> {
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
  return [...paths]
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
/**
 * The phone navigation's open button, if any: the visible header button that controls or expands something. Visible,
 * because a header may hold other disclosure buttons that are hidden at this width (the docs layer's language menu
 * comes before its menu button and is hidden on phones); a site header has only the nav button.
 */
export const navToggle = (page: Page) => page.locator('header button[aria-expanded], header button[aria-controls], header [aria-haspopup="dialog"]').filter({ visible: true }).first()

export { expect } from '@playwright/test'
