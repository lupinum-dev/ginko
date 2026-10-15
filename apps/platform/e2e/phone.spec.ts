// Phones (volume-1): the tab bar is fixed over the end of the page, so the last button of a long list must end above it.
// Before, "weitere anzeigen" under an area list sat behind the tab bar at 390 px: a tap opened a tab instead.
import { expect, test } from '@playwright/test'
import { STATE } from './global-setup'
import { resetContent } from './local'

// 52 more dishes: the menu then holds 60, so the list shows 50 and offers the other 10.
test.beforeEach(() => resetContent({ brick: 'menu', count: 52 }))
test.afterAll(() => resetContent())
test.use({ storageState: STATE.owner, viewport: { width: 390, height: 844 } })

test('the last button of a long area list is tappable above the tab bar', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone layout only')
  await page.goto('/s/restaurant/all/menu', { waitUntil: 'networkidle' })
  const more = page.getByRole('button', { name: '10 weitere anzeigen' })
  await expect(more).toBeVisible()

  // Scrolled to the very end, as far as a thumb can go.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const box = (await more.boundingBox())!
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  // The button itself is under the finger, not the tab bar.
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.textContent?.trim(), centre)).toBe('10 weitere anzeigen')
  await page.mouse.click(centre.x, centre.y)

  await expect(page.locator('main ol > li')).toHaveCount(60)
  await expect(page).toHaveURL(/\/s\/restaurant\/all\/menu$/)
})
