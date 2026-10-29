// Gate 7 job (spec TEMPLATES.md §5, saas: "pricing, rare"; must never: "wrong price"): the owner picks a plan in "change
// a price", sets the price per month and per year, and the pricing page shows both on that plan, also in its
// Product JSON-LD. Not synced into a template; run by `pnpm templates test <name> --platform`.
import { expect, test } from '@playwright/test'
import { job, studio } from '../../../../../scripts/templates/e2e/studio.ts'

// The template's names for this job come from "planPrice": { task, plan, monthly, yearly, shownMonthly, shownYearly,
// path } in templates/_studio/<template>/jobs.json: the label of the pricing brick's price task, the plan's name in the
// main language, the new prices as typed in the German Studio, as the pricing page writes them, and the page's address.
const PRICE = job('planPrice', ['task', 'plan', 'monthly', 'yearly', 'shownMonthly', 'shownYearly', 'path'])

/** The plan's card on the pricing page. */
const card = (page: import('@playwright/test').Page) => page.locator('[data-plan]').filter({ has: page.getByRole('heading', { name: PRICE.plan, exact: true }) })

test('the owner changes the prices of a plan, and the pricing page shows both', async ({ page, request }) => {
  // Wrong set-up caught: a price the page already shows proves nothing.
  await page.goto(`${studio.siteUrl}${PRICE.path}`)
  await expect(card(page).locator('[data-monthly]')).not.toHaveText(PRICE.shownMonthly)

  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: PRICE.task, exact: true }).click()
  // The task first asks which plan.
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${PRICE.plan}`) }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel(/^Preis pro Monat/).fill(PRICE.monthly)
  await sheet.getByLabel(/^Preis pro Jahr/).fill(PRICE.yearly)
  await sheet.getByRole('button', { name: 'Veröffentlichen' }).click()
  await expect(sheet).toHaveCount(0)

  // Wrong behaviour caught: one of the two prices stays old on the page (the task saves only one), or search engines
  // keep reading the old price from the JSON-LD.
  await expect(async () => {
    await page.goto(`${studio.siteUrl}${PRICE.path}`)
    await expect(card(page).locator('[data-monthly]')).toHaveText(PRICE.shownMonthly, { timeout: 2_000 })
    await expect(card(page).locator('[data-yearly]')).toContainText(PRICE.shownYearly, { timeout: 2_000 })
  }).toPass({ timeout: 60_000 })
  const html = await (await request.get(`${studio.siteUrl}${PRICE.path}`)).text()
  const products = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)]
    .flatMap(([, json]) => [JSON.parse(json!)].flat())
    .flatMap((node: { '@graph'?: unknown[] }) => node['@graph'] ?? [node]) as { '@type'?: string, name?: string, offers?: { price?: number | string }[] }[]
  // The Product is named "<site name> <plan>" (usePricingJsonLd).
  const product = products.find((node) => node['@type'] === 'Product' && node.name?.endsWith(` ${PRICE.plan}`))
  expect(product?.offers?.map((offer) => Number(offer.price))).toEqual([Number(PRICE.monthly), Number(PRICE.yearly)])
})
