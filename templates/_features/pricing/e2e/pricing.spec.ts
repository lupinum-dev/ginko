// The pricing feature on the built template (gate 3): every plan shows its prices per month and per year as written in
// content/pricing/ (or "on request"), one plan at most is marked recommended with a word, and the Product JSON-LD of
// the page carries the same prices and the site's currency, and nothing for a plan on request.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, open, site, test } from '../../../../scripts/templates/e2e/helpers.ts'

const dir = fileURLToPath(new URL(`../../../${site.name}/content/pricing/`, import.meta.url))
/** Main-language plans in their order: id, name, pricing, the amounts as written (`monthly: 89`), recommended. */
const plans = existsSync(dir)
  ? readdirSync(dir).filter((file) => /^\d+\.[^.]+\.md$/.test(file)).sort().map((file) => {
    const text = readFileSync(`${dir}${file}`, 'utf8')
    const value = (key: string) => new RegExp(`^${key}:[ \\t]*(.+?)[ \\t]*$`, 'm').exec(text)?.[1]?.replace(/^(['"])(.*)\1$/, '$2')
    return { id: `pricing/${file.replace(/^\d+\./, '').replace(/\.md$/, '')}`, name: value('name')!, pricing: value('pricing'), monthly: value('monthly'), yearly: value('yearly'), recommended: value('recommended') === 'true' }
  })
  : []

/** The digits of a price as shown, whatever the separators of the language ("€1,290", "1 290 €"). */
const digits = (text: string | null) => (text ?? '').replace(/\D/g, '')

test('each plan shows its monthly and yearly price or "on request", and the JSON-LD says the same', async ({ page }) => {
  test.skip(!plans.length, 'no plans in the samples')
  // The pricing page: the header link whose page lists the plans.
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, '/')
  let found = false
  for (const href of await page.locator('header nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))) {
    await open(page, href)
    if (await page.locator('main [data-plan]').count()) {
      found = true
      break
    }
  }
  expect(found, 'the pricing page in the header').toBe(true)
  // Wrong behaviour caught: a plan of the files missing from the page, or plans in another order.
  expect(await page.locator('main [data-plan]').evaluateAll((items) => items.map((item) => item.getAttribute('data-plan'))), 'plans in their order').toEqual(plans.map((plan) => plan.id))
  const products = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts) => scripts
    .flatMap((script) => {
      const data = JSON.parse(script.textContent ?? '{}')
      return Array.isArray(data) ? data : data['@graph'] ?? [data]
    }).filter((node) => node['@type'] === 'Product'))
  for (const plan of plans) {
    const card = page.locator(`main [data-plan="${plan.id}"]`)
    await expect.soft(card.locator('h2, h3').first(), `${plan.id} name`).toHaveText(plan.name)
    const product = products.find((node) => String(node.name).endsWith(plan.name))
    const free = plan.pricing === 'price' && Number(plan.monthly) === 0 && Number(plan.yearly) === 0
    if (free) {
      // Wrong behaviour caught: a free plan that shows "€0 per month" and "or €0 per year" instead of one "Free" line.
      await expect.soft(card.locator('[data-free]'), `${plan.id} free`).toBeVisible()
      expect.soft(await card.locator('[data-monthly], [data-yearly]').count(), `${plan.id} without zero prices`).toBe(0)
    }
    else if (plan.pricing === 'price') {
      // Wrong behaviour caught: a price per month or per year that differs from the file, or one left out.
      expect.soft(digits(await card.locator('[data-monthly]').textContent()), `${plan.id} monthly`).toBe(digits(String(Math.trunc(Number(plan.monthly)))))
      expect.soft(digits(await card.locator('[data-yearly]').textContent()), `${plan.id} yearly`).toContain(digits(String(Math.trunc(Number(plan.yearly)))))
      const offers = (product?.offers ?? []) as { price: string, priceCurrency: string, priceSpecification?: { referenceQuantity?: { unitCode?: string } } }[]
      const unit = (code: string) => offers.find((offer) => offer.priceSpecification?.referenceQuantity?.unitCode === code)
      expect.soft(Number(unit('MON')?.price), `${plan.id} JSON-LD monthly`).toBe(Number(plan.monthly))
      expect.soft(Number(unit('ANN')?.price), `${plan.id} JSON-LD yearly`).toBe(Number(plan.yearly))
      expect.soft(offers.every((offer) => offer.priceCurrency === site.currency), `${plan.id} JSON-LD currency ${site.currency}`).toBe(true)
    }
    else {
      // Wrong behaviour caught: a plan on request that shows an amount, or gives search engines a price.
      await expect.soft(card.locator('[data-on-request]'), `${plan.id} on request`).toBeVisible()
      expect.soft(await card.locator('[data-monthly], [data-yearly]').count(), `${plan.id} without prices`).toBe(0)
      expect.soft(product, `${plan.id} has no Product`).toBeUndefined()
    }
  }
  // The recommended plan is marked with a word, not by colour alone, and only one is.
  const recommended = plans.find((plan) => plan.recommended)
  const marked = await page.locator('main [data-plan]:has([data-recommended])').evaluateAll((items) => items.map((item) => item.getAttribute('data-plan')))
  expect(marked, 'the recommended plan').toEqual(recommended ? [recommended.id] : [])
})
