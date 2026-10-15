// The events feature on the built template (gate 3): only events still to come, each page with an Event JSON-LD
// whose start carries the site's time zone offset.
import { expect, open, site, test } from '../../../../scripts/templates/e2e/helpers.ts'

test('every listed event is still to come and its page has Event JSON-LD with a zone offset', async ({ page }) => {
  await open(page, '/events')
  const links = await page.locator('main li h3 a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))
  expect(links.length, 'events listed').toBeGreaterThan(0)
  const today = site.now.slice(0, 10)
  for (const href of links) {
    const response = await open(page, href)
    expect.soft(response?.status(), `${href} status`).toBe(200)
    const event = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts) => scripts.flatMap((script) => {
      const data = JSON.parse(script.textContent ?? '{}')
      return Array.isArray(data) ? data : data['@graph'] ?? [data]
    }).find((node) => node['@type'] === 'Event'))
    expect.soft(event, `${href} Event JSON-LD`).toBeTruthy()
    // Wrong behaviour caught: a past event still listed, or a start time without offset (Google reads it as UTC).
    expect.soft(String(event?.endDate ?? event?.startDate).slice(0, 10) >= today, `${href} is not over`).toBe(true)
    if (String(event?.startDate).includes('T')) expect.soft(event.startDate, `${href} start with offset`).toMatch(/[+-]\d{2}:\d{2}$/)
  }
})
