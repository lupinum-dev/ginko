// The pages feature on the built template (gate 3): every page of the navigation opens with its own title.
import { expect, open, test } from '../../../../scripts/templates/e2e/helpers.ts'

test('each header link to a page opens it with the link text as its title', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, '/')
  const links = await page.locator('header nav a').evaluateAll((as) => as.map((a) => ({ href: a.getAttribute('href')!, text: a.textContent!.trim() })))
  // Wrong behaviour caught: a menu entry for a page whose file is missing or untranslated (it would 404).
  expect(links.length, 'links in the header navigation').toBeGreaterThan(0)
  for (const { href, text } of links) {
    const response = await open(page, href)
    expect.soft(response?.status(), `${href} status`).toBe(200)
    await expect.soft(page.locator('h1'), `${href} title`).toHaveText(text)
    await expect.soft(page.locator('header nav a[aria-current="page"]'), `${href} marked as current`).toHaveText(text)
  }
})
