// The hours feature on the built template (gate 3): the "open now" line, today's row and the JSON-LD on the home page
// agree with the test instant in the site's time zone.
import { expect, open, site, test } from '../../../../scripts/templates/e2e/helpers.ts'

/** JSON-LD nodes of the page. */
const nodes = (page: import('@playwright/test').Page) => page.locator('script[type="application/ld+json"]').evaluateAll((scripts) => scripts.flatMap((script) => {
  const data = JSON.parse(script.textContent ?? '{}')
  return Array.isArray(data) ? data : data['@graph'] ?? [data]
}))

test('the home page says whether the place is open, the same in the server’s HTML and after hydration', async ({ page, browser }) => {
  await open(page, '/')
  const line = page.locator('main [data-hours-now]').first()
  await expect(line, 'an hours line in the first screen').toBeVisible()
  // The same page without JavaScript shows the server's render: the line the visitor sees before hydration.
  const plain = await browser.newPage({ javaScriptEnabled: false })
  await plain.goto(page.url())
  const server = await plain.locator('main [data-hours-now]').first().innerText()
  await plain.close()
  // Wrong behaviour caught: a server and a browser that disagree about "now" or the zone, so the line flips after load.
  expect(await line.innerText(), 'the line after hydration').toBe(server)
  const weekday = new Intl.DateTimeFormat(site.language, { weekday: 'long', timeZone: site.timeZone }).format(new Date(site.now))
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
