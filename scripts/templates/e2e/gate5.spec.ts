// Gate 5 (TEMPLATES.md §9): no horizontal overflow at 390, header and navigation visible at 390 and 1440, and
// screenshots (viewport, fonts ready, animations off, test clock) as review material. No pixel baselines yet.
import { join } from 'node:path'
import { expect, navToggle, open, site, sitePages, slugOf, test } from './helpers.ts'

for (const width of [390, 1440]) {
  test(`layout at ${width}: no horizontal overflow, header and navigation visible; screenshots`, async ({ page }) => {
    test.setTimeout(600_000)
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    for (const path of await sitePages()) {
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
        await open(page, path)
        if (scheme === 'light') {
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
          expect.soft(overflow, `${path} at ${width}: page wider than the viewport by`).toBeLessThanOrEqual(0)
          await expect.soft(page.locator('header').first(), `${path} at ${width}: header`).toBeVisible()
          const nav = page.locator('header nav').first()
          const reachable = await nav.isVisible() || await navToggle(page).isVisible()
          expect.soft(reachable, `${path} at ${width}: navigation or its button visible`).toBe(true)
        }
        await page.screenshot({ path: join(site.shots, `${slugOf(path)}-${width}-${scheme}.png`), animations: 'disabled' })
      }
    }
  })
}
