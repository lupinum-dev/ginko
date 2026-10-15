// The site feature on the built template (gate 3): notices, footer legal links, legal pages and the error page.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, open, site, test } from '../../../../scripts/templates/e2e/helpers.ts'

/** The template's notices shown at the test instant: main-language files whose `until` has not passed. */
function activeNotices(): number {
  const dir = fileURLToPath(new URL(`../../../${site.name}/content/notices/`, import.meta.url))
  if (!existsSync(dir)) return 0
  const today = site.now.slice(0, 10)
  return readdirSync(dir).filter((file) => /^\d+\.[^.]+\.md$/.test(file)).filter((file) => {
    const until = /^until:\s*(\S+)/m.exec(readFileSync(join(dir, file), 'utf8'))?.[1]
    return !until || until >= today
  }).length
}

test('the footer links every legal text, and each opens with its title and date', async ({ page }) => {
  await open(page, '/')
  const links = page.locator('footer nav').last().getByRole('link')
  const count = await links.count()
  // Wrong behaviour caught: legal texts that exist in content/legal/ but are not reachable from any page.
  expect(count, 'legal links in the footer').toBeGreaterThan(0)
  const targets = await links.evaluateAll((as) => as.map((a) => ({ href: a.getAttribute('href')!, text: a.textContent!.trim() })))
  for (const { href, text } of targets) {
    const response = await open(page, href)
    expect.soft(response?.status(), `${href} status`).toBe(200)
    await expect.soft(page.locator('h1'), `${href} title`).toHaveText(text)
    await expect.soft(page.locator('main header p').last(), `${href} shows its date`).toContainText(/\d/)
    await expect.soft(page.locator('footer nav').last().locator('a[aria-current="page"]'), `${href} marked as current in the footer`).toHaveText(text)
  }
})

test('active notices show above the header, at most two', async ({ page }) => {
  await open(page, '/')
  // The section right before the header, so screen readers meet the notices first.
  const bar = page.locator('body section:has(+ header)')
  const expected = Math.min(2, activeNotices())
  // Wrong behaviour caught: a broken notice bar that shows nothing while the template has an active sample notice.
  await expect(bar.locator('li'), 'notices shown').toHaveCount(expected)
  if (expected) await expect(bar, 'the notice bar is a named region').toHaveAttribute('aria-label', /\S/)
})

test('the skip link moves to the main content', async ({ page }) => {
  await open(page, '/')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.locator('main#main')).toBeFocused()
})

test('the error page leads back home', async ({ page }) => {
  await page.goto('/no-such-page-7c1d')
  await page.locator('main').getByRole('link').first().click()
  await expect(page).toHaveURL(/\/$|\/[a-z]{2}$/)
  await expect(page.locator('h1')).toBeVisible()
})
