// The site feature on the built template (gate 3): notices, footer legal links, legal pages, the error page, and where the
// language switch sits.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Locator } from '@playwright/test'
import { expect, navToggle, open, site, test } from '../../../../scripts/templates/e2e/helpers.ts'

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

/** Each link of a language switch: one per locale, the current one marked, and a spoken name that starts with the
 *  visible text (WCAG 2.5.3), so a voice control user can say "click Deutsch" or "click DE". */
async function expectSwitch(list: Locator, where: string) {
  const links = list.getByRole('link')
  await expect(links, `${where}: one link per language`).toHaveCount(site.locales.length)
  await expect(list.locator('a[aria-current="true"]'), `${where}: the current language is marked`).toHaveCount(1)
  for (const link of await links.all()) {
    const visible = await link.evaluate((a) => {
      const walk = document.createTreeWalker(a, NodeFilter.SHOW_TEXT)
      let text = ''
      while (walk.nextNode()) if (!walk.currentNode.parentElement!.closest('.sr-only')) text += walk.currentNode.textContent
      return text.trim()
    })
    expect(visible, `${where}: a visible text`).not.toBe('')
    const escaped = visible.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')
    await expect(link, `${where}: the name starts with "${visible}"`).toHaveAccessibleName(new RegExp(`^${escaped}`, 'i'))
  }
}

test('on a phone the language switch is in the nav sheet and the footer, with full names', async ({ page }) => {
  test.skip(site.locales.length < 2, 'one language: no switch')
  await open(page, '/')
  // Wrong behaviour caught: the codes squeezed into the phone header next to the menu button.
  await expect(page.locator('header a[hreflang]:visible'), 'no language links in the phone header').toHaveCount(0)
  await expectSwitch(page.locator('footer ul:has(a[hreflang])'), 'footer')
  await navToggle(page).click()
  const sheet = page.getByRole('dialog')
  await expectSwitch(sheet.locator('ul:has(a[hreflang])'), 'nav sheet')
  // Full names, not codes: longer than a two-letter code.
  for (const text of await sheet.locator('a[hreflang]').allInnerTexts()) expect(text.trim().length, `"${text}" is a name`).toBeGreaterThan(3)
})

test('from md up the language switch shows codes in the header', async ({ page }) => {
  test.skip(site.locales.length < 2, 'one language: no switch')
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, '/')
  await expectSwitch(page.locator('header ul:has(a[hreflang])'), 'header')
})
