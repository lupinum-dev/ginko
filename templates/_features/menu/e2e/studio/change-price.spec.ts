// Gate 7 job (spec TEMPLATES.md §5, restaurant: "price change, monthly"): the owner picks a dish in "change a price",
// sets the new price, and the menu shows it. Not synced into a template; run by `pnpm templates test <name> --platform`.
import { expect, test } from '@playwright/test'
import { job, studio } from '../../../../../scripts/templates/e2e/studio.ts'

// The template's names for this job come from "price": { task, dish, price, shown, path } in
// templates/_studio/<template>/jobs.json: the label of the menu's price task, the dish's name in the main language,
// the new price as typed in the German Studio ("27,40"), as the menu page writes it ("27.40") and the menu's address.
const PRICE = job('price', ['task', 'dish', 'price', 'shown', 'path'])

test('the owner changes the price of a dish, and the menu shows it', async ({ page, request }) => {
  const before = await (await request.get(`${studio.siteUrl}${PRICE.path}`)).text()
  // Wrong set-up caught: a price that the menu already shows proves nothing.
  expect(before, 'the new price is not on the menu yet').not.toContain(PRICE.shown)
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: PRICE.task, exact: true }).click()
  // The task first asks which dish: the list shows each dish with its price.
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${PRICE.dish}`) }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Preis', { exact: true }).fill(PRICE.price)
  await sheet.getByRole('button', { name: 'Speichern' }).click()
  await expect(sheet).toHaveCount(0)

  // The dish's own line (name and price) shows the new price, not just any "27.40" elsewhere on the page.
  await expect(async () => {
    await page.goto(`${studio.siteUrl}${PRICE.path}`)
    const line = page.getByRole('heading', { name: PRICE.dish }).locator('xpath=..')
    await expect(line).toContainText(PRICE.shown, { timeout: 2_000 })
  }).toPass({ timeout: 60_000 })
})
