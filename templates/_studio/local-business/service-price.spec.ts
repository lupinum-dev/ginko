// Gate 7 job (spec TEMPLATES.md §5, local-business: "prices, yearly"; must never: "wrong prices"): the owner picks a
// treatment in "change a price", sets the new amount, and the treatment's page shows it instead of the old one. Run by
// `pnpm templates test local-business --platform`.
import { expect, test } from '@playwright/test'
import { job, studio } from '../../../scripts/templates/e2e/studio.ts'

// The practice's names for this job come from "servicePrice": { task, service, price, shown, old, path } in jobs.json:
// the label of the services brick's price task, the treatment's name in the main language, the new amount as typed in
// the German Studio, the new and the old price as the page writes them, and the treatment's page.
const PRICE = job('servicePrice', ['task', 'service', 'price', 'shown', 'old', 'path'])

test('the owner changes the price of a treatment, and its page shows the new price', async ({ page }) => {
  // The price is the value next to its label ("Price", or with the VAT note) in the facts of the page.
  const shownPrice = () => page.locator('dt', { hasText: /^Price/ }).locator('xpath=following-sibling::dd[1]')
  await page.goto(`${studio.siteUrl}${PRICE.path}`)
  // Wrong set-up caught: a page that does not show the old price cannot prove the change.
  await expect(shownPrice()).toHaveText(PRICE.old)

  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: PRICE.task, exact: true }).click()
  // The task first asks which treatment.
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${PRICE.service}`) }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel(/^Betrag/).fill(PRICE.price)
  await sheet.getByRole('button', { name: 'Veröffentlichen' }).click()
  await expect(sheet).toHaveCount(0)

  // Wrong behaviour caught: the page keeps the old price, or loses the price ("On request") after the save.
  await expect(async () => {
    await page.goto(`${studio.siteUrl}${PRICE.path}`)
    await expect(shownPrice()).toHaveText(PRICE.shown, { timeout: 2_000 })
  }).toPass({ timeout: 60_000 })
})
