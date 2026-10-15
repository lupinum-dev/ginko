// Gate 5 (TEMPLATES.md §9): no horizontal overflow at 320 and 390, header and navigation visible at every width, and
// screenshots (viewport, fonts ready, animations off, test clock) as review material. No pixel baselines yet.
import { join } from 'node:path'
import { expect, navToggle, open, site, sitePages, slugOf, test } from './helpers.ts'

// 320: the narrowest phone of the design rules (TEMPLATES-DESIGN §1); long words and paths overflow there first.
for (const [width, height] of [[320, 568], [390, 844], [1440, 900]] as const) {
  test(`layout at ${width}: no horizontal overflow, header and navigation visible; screenshots`, async ({ page }) => {
    test.setTimeout(600_000)
    await page.setViewportSize({ width, height })
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
