// Gate 7 job (spec TEMPLATES.md §5, nonprofit: "add event, monthly"): the owner adds an event with its date, time and
// text, and the events page lists it. Not synced into a template; run by `pnpm templates test <name> --platform`.
import { expect, test } from '@playwright/test'
import { job, studio } from '../../../../../scripts/templates/e2e/studio.ts'

// The template's names for this job come from "event": { task, path } in templates/_studio/<template>/jobs.json: the
// label of the events brick's create task and the events page's address.
const EVENT = job('event', ['task', 'path'])

test('the owner adds an event, and the events page lists it', async ({ page }) => {
  const title = `Gate seven meet-up ${Date.now()}`
  const day = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10)
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: EVENT.task, exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Titel', { exact: true }).fill(title)
  await sheet.getByLabel('von', { exact: true }).fill(day)
  await sheet.getByLabel('bis', { exact: true }).fill(day)
  await sheet.getByLabel(/^Beginn/).fill('18:00')
  await sheet.getByRole('textbox', { name: 'Beschreibung', exact: true }).click()
  await page.keyboard.type('An evening to plan the next season together.')
  await sheet.getByRole('button', { name: 'Veröffentlichen' }).click()
  await expect(sheet).toHaveCount(0)

  // Wrong behaviour caught: an event saved in the Studio that the site does not list (or lists without its page).
  await expect(async () => {
    await page.goto(`${studio.siteUrl}${EVENT.path}`)
    await page.getByRole('link', { name: title, exact: true }).click({ timeout: 2_000 })
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 60_000 })
})
