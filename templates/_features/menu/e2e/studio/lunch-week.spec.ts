// Gate 7 job (spec TEMPLATES.md §5, restaurant: "lunch week, weekly, staff with approval"): this week's lunch gets a
// new dish, the Studio asks to confirm its allergens, and the lunch page shows the dish. The harness signs in one
// account (the owner), and an owner's change needs no approval; the cook's "send for review" needs a staff account
// (Studio gaps in the gate-7 report). Not synced into a template; run by `pnpm templates test <name> --platform`.
import { expect, test } from '@playwright/test'
import { job, studio } from '../../../../../scripts/templates/e2e/studio.ts'

// The template's names for this job come from "lunch": { task, path } in templates/_studio/<template>/jobs.json: the
// label of the lunch brick's weekly task and the lunch page's address.
const LUNCH = job('lunch', ['task', 'path'])
// The Studio's German weekday headings, Monday to Friday. The dish goes on a day other than today, so a closure of
// today (which hides today's dish on the site) cannot hide it.
const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag']

test('the lunch week gets a new dish, and the lunch page shows it', async ({ page }) => {
  const dish = `Gate seven goulash ${Date.now()}`
  // Today's weekday in the site's time zone, not the runner's: near midnight they differ.
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Europe/Vienna' }).format(new Date())
  const day = DAYS[today === 'Tuesday' ? 2 : 1]!
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: LUNCH.task, exact: true }).click()
  const sheet = page.getByRole('dialog')
  const row = sheet.locator('li', { has: page.getByRole('heading', { name: day, exact: true }) })
  await row.getByLabel('Gericht', { exact: true }).fill(dish)
  // A new dish keeps the old allergens only after a "yes": wrong allergens must never go online by accident.
  await row.getByRole('button', { name: 'Ja, stimmt' }).click()
  await sheet.getByRole('button', { name: 'Speichern' }).click()
  await expect(sheet).toHaveCount(0)

  await expect(async () => {
    await page.goto(`${studio.siteUrl}${LUNCH.path}`)
    await expect(page.getByRole('listitem').filter({ hasText: dish })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 60_000 })
})
