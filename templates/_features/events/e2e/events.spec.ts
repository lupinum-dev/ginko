// The events feature on the built template (gate 3): only events still to come, each page with an Event JSON-LD
// whose start carries the site's time zone offset.
import { expect, open, site, test } from '../../../../scripts/templates/e2e/helpers.ts'

test('every listed event is still to come and its page has Event JSON-LD with a zone offset', async ({ page }) => {
  // The events page: the header or footer link whose page lists cards that link below its own address. A template
  // names the page in its own words (`/trade-fairs`) and puts it where it fits (the events template has its dates in
  // the footer), so neither the address nor the place is assumed.
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, '/')
  let links: string[] = []
  const pages = await page.locator('header nav a, footer nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))
  for (const href of new Set(pages)) {
    await open(page, href)
    const cards = await page.locator('main li h3 a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))
    if (cards.length && cards.every((card) => card.startsWith(`${href}/`))) {
      links = cards
      break
    }
  }
  expect(links.length, 'events listed on a page of the header or footer').toBeGreaterThan(0)
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
