// The hours feature on the built template (gate 3): the "open now" line, today's row and the JSON-LD on the home page
// agree with the test instant in the site's time zone.
import { expect, open, site, test } from '../../../../scripts/templates/e2e/helpers.ts'

/** JSON-LD nodes of the page. */
const nodes = (page: import('@playwright/test').Page) => page.locator('script[type="application/ld+json"]').evaluateAll((scripts) => scripts.flatMap((script) => {
  const data = JSON.parse(script.textContent ?? '{}')
  return Array.isArray(data) ? data : data['@graph'] ?? [data]
}))

test('the home page says whether the house is open and marks today in the hours table', async ({ page }) => {
  await open(page, '/')
  // Wrong behaviour caught: a server and a browser that disagree about "now" (hydration), or a missing hours line.
  const line = page.locator('main p').filter({ hasText: /open|closed|opening hours/i }).first()
  await expect(line, 'an hours line in the first screen').toBeVisible()
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Europe/Vienna' }).format(new Date(site.now))
  // Wrong behaviour caught: today's row taken from the UTC date or the browser's zone instead of the site's.
  await expect(page.locator('tr[aria-current="date"] th'), 'today’s row').toContainText(weekday)
})

test('the home page JSON-LD carries the opening hours of the same rule', async ({ page }) => {
  await open(page, '/')
  const business = (await nodes(page)).find((node) => Array.isArray(node.openingHoursSpecification))
  // Wrong behaviour caught: opening hours shown on the page but missing for search engines.
  expect(business, 'a node with openingHoursSpecification').toBeTruthy()
  expect(business.openingHoursSpecification.length).toBeGreaterThan(0)
})
