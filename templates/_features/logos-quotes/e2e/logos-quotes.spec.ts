// The logos and quotes feature on the built template (gate 3): every logo on the home page has a name for screen
// readers and loads.
import { expect, open, test } from '../../../../scripts/templates/e2e/helpers.ts'

test('the logos on the home page load and are named', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, '/')
  const logos = page.locator('main img[src*="logo"], main img[alt][src$=".svg"]')
  test.skip(!(await logos.count()), 'no logos on the home page')
  for (const logo of await logos.all()) {
    await logo.scrollIntoViewIfNeeded()
    // Wrong behaviour caught: a logo file missing from public/ (a broken image), or a logo without alt text.
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
    expect((await logo.getAttribute('alt'))?.trim()).toBeTruthy()
  }
})
