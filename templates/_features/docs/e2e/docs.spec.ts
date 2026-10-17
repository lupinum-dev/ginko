// The docs feature on the built template (gate 3): the visitor jobs of a docs site at phone width. From the start
// page in at most two taps: install and first call, a guide, the reference, the changelog; the search finds a
// method by its name; the changelog lists versions newest first; a page without a translation says so instead of
// sending the reader to a missing page.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Locator } from '@playwright/test'
import { expect, open, site, test } from '../../../../scripts/templates/e2e/helpers.ts'

const dir = fileURLToPath(new URL(`../../../${site.name}/content/docs/`, import.meta.url))
const files = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith('.md')) : []
const main = files.filter((file) => file.split('.').length === 3)
const text = (file: string) => readFileSync(`${dir}${file}`, 'utf8')
/** The address of a main-language page: its `slug`, else its file name without number and extension. */
const pathOf = (file: string) => `/docs/${/^slug:\s*(\S+)/m.exec(text(file))?.[1] ?? file.split('.')[1]}`
/** A method of the reference: the first heading such as `## monitors.pause()`. */
const method = main.map((file) => ({ file, name: /^#{2,3} ([\w.]+)\(\)\s*$/m.exec(text(file))?.[1] })).find((m) => m.name)

/** Clicks `button` until `target` shows: a click before the page has hydrated does nothing. */
async function reveal(button: Locator, target: Locator) {
  await expect(async () => {
    if (!await target.isVisible()) await button.click()
    await expect(target).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
}

test.use({ viewport: { width: 390, height: 844 } })

test('the start page leads in one tap to getting started, with the install command for npm and pnpm', async ({ page }) => {
  await open(page, '/')
  await page.locator('main .docs-hero-links a').first().click()
  await expect(page.locator('h1')).toBeVisible()
  const code = page.locator('main pre')
  await expect(code.filter({ hasText: /npm (install|i) / }).first(), 'an npm install command').toBeAttached()
  await expect(code.filter({ hasText: /pnpm add / }).first(), 'a pnpm install command').toBeAttached()
})

test('every card of the start page opens its page in one tap', async ({ page, request }) => {
  await open(page, '/')
  const hrefs = await page.locator('main .docs-feature a').evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''))
  // Wrong behaviour caught: a card whose `$docs.<page>` link names no page and stays unresolved.
  expect(hrefs.length, 'cards with a link').toBeGreaterThan(0)
  for (const href of hrefs) {
    expect.soft(href, 'card link is a path').toMatch(/^\//)
    expect.soft((await request.get(href)).status(), `card ${href}`).toBe(200)
  }
})

test('the search finds a method of the reference by its name and opens it', async ({ page }) => {
  test.skip(!method, 'no method heading such as "## x.y()" in content/docs')
  await open(page, '/')
  await reveal(page.locator('header .docs-search-trigger'), page.getByRole('combobox'))
  await page.getByRole('combobox').fill(method!.name!)
  const hit = page.getByRole('option').filter({ hasText: `${method!.name}()` }).first()
  await expect(hit, `a hit for ${method!.name}`).toBeVisible()
  await hit.click()
  await expect(page).toHaveURL(new RegExp(`${pathOf(method!.file)}#`))
})

test('the changelog lists every version with its date, newest first', async ({ page }) => {
  await open(page, '/changelog')
  const dates = await page.locator('main section time[datetime]').evaluateAll((times) => times.map((t) => t.getAttribute('datetime') ?? ''))
  expect(dates.length, 'versions with a date').toBeGreaterThan(1)
  expect(dates, 'newest first').toEqual([...dates].sort().reverse())
})

test('a page without a translation names it in the language menu and leads to that language\'s start page', async ({ page }) => {
  const other = site.locales[1]
  test.skip(!other, 'one language')
  const untranslated = main.find((file) => !files.includes(file.replace(/\.md$/, `.${other}.md`)))
  test.skip(!untranslated, `every page has a ${other} version`)
  await open(page, pathOf(untranslated!))
  const link = page.getByRole('dialog').locator(`a[hreflang|="${other}"]`)
  await reveal(page.locator('.docs-header-menu'), link)
  await expect(link.locator('small'), 'says the page is not translated').toBeVisible()
  await link.click()
  await expect(page).toHaveURL(new RegExp(`/${other}$`))
  await expect(page.locator('h1')).toBeVisible()
})
