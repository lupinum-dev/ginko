// The services feature on the built template (gate 3): every service says its price or that it is priced on
// request, and the Service JSON-LD of its page carries the same price, or no offer for a service on request.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, open, site, test } from '../../../../scripts/templates/e2e/helpers.ts'

const dir = fileURLToPath(new URL(`../../../${site.name}/content/services/`, import.meta.url))
/** Main-language services: slug, pricing and the price in major units as written (`price: 390`). */
const services = existsSync(dir)
  ? readdirSync(dir).filter((file) => /^\d+\.[^.]+\.md$/.test(file)).map((file) => readFileSync(`${dir}${file}`, 'utf8'))
    .map((text) => ({ slug: /^slug:\s*(\S+)/m.exec(text)![1]!, pricing: /^pricing:\s*(\S+)/m.exec(text)?.[1], price: /^price:\s*([\d.]+)/m.exec(text)?.[1] }))
  : []

/** The Service node of the page's JSON-LD. */
const serviceLd = (page: import('@playwright/test').Page) => page.locator('script[type="application/ld+json"]').evaluateAll((scripts) => scripts
  .flatMap((script) => {
    const data = JSON.parse(script.textContent ?? '{}')
    return Array.isArray(data) ? data : data['@graph'] ?? [data]
  }).find((node) => node['@type'] === 'Service'))

test('each service shows its price or "on request", and its JSON-LD has the same price or no offer', async ({ page }) => {
  test.skip(!services.length, 'no services in the samples')
  // The services page: the header link whose page has a card for the first service.
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, '/')
  let list = ''
  for (const href of await page.locator('header nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))) {
    await open(page, href)
    if (await page.locator(`main li a[href$="/${services[0]!.slug}"]`).count()) {
      list = href
      break
    }
  }
  expect(list, 'the services page in the header').not.toBe('')
  const onRequest = new Set<string>()
  for (const service of services) {
    await open(page, list)
    const card = page.locator('main li').filter({ has: page.locator(`a[href$="/${service.slug}"]`) })
    const meta = (await card.locator('p').first().textContent())!.trim()
    // Wrong behaviour caught: a card without a price line, or a fixed price that shows as "on request" or vice versa.
    // The amount's digits, whatever the separators of the language ("€1,200", "1.200 €").
    if (service.pricing === 'price') expect.soft(meta.split(' · ')[0]!.replace(/\D/g, ''), `${service.slug} card: ${meta}`).toContain(String(Math.trunc(Number(service.price))))
    else onRequest.add(meta.split(' · ')[0]!)
    await open(page, (await card.locator('a').first().getAttribute('href'))!)
    const ld = await serviceLd(page)
    expect.soft(ld, `${service.slug} Service JSON-LD`).toBeTruthy()
    // Wrong behaviour caught: search engines read a price that the page does not show (or none for a priced service).
    if (service.pricing === 'price') {
      expect.soft(Number(ld?.offers?.price), `${service.slug} offer price`).toBe(Number(service.price))
      expect.soft(ld?.offers?.priceCurrency, `${service.slug} offer currency`).toBe(site.currency)
    }
    else expect.soft(ld?.offers, `${service.slug} has no offer`).toBeUndefined()
  }
  // Every service on request says the same words, with no amount in them.
  expect.soft([...onRequest].filter((text) => /\d/.test(text)), 'on request without an amount').toEqual([])
})
