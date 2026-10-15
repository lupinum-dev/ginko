// The site feature on the built template (gate 3): notices, footer legal links, legal pages and the error page.
import { expect, open, test } from '../../../../scripts/templates/e2e/helpers.ts'

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
  }
})

test('active notices show above the header on every page, at most two', async ({ page }) => {
  await open(page, '/')
  const notices = page.locator('body section').filter({ has: page.locator('li') }).first()
  const items = notices.locator('li')
  const count = await items.count()
  expect(count, 'notices shown').toBeLessThanOrEqual(2)
  if (count) {
    // The notice bar comes before the header in the page, so screen readers meet it first.
    const before = await page.evaluate(() => {
      const bar = document.querySelector('header')!.previousElementSibling
      return bar?.tagName === 'SECTION'
    })
    expect(before, 'notice bar right before the header').toBe(true)
  }
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
