// Gate 7 job (spec TEMPLATES.md §5, nonprofit: "post news, weekly, volunteers with approval"; company: "news,
// monthly"): the owner writes a news post from Today and publishes it, and the news list shows it. The harness signs
// in one account (the owner), and an owner publishes without approval; a volunteer's "send for review" needs a staff
// account (Studio gaps in the gate-7 report). Not synced into a template; run by `pnpm templates test <name> --platform`.
import { expect, test } from '@playwright/test'
import { job, studio } from '../../../../../scripts/templates/e2e/studio.ts'

// The template's names for this job come from "news": { task, path } in templates/_studio/<template>/jobs.json: the
// label of the posts brick's create task and the news list's address.
const NEWS = job('news', ['task', 'path'])

test('the owner writes a news post and publishes it, and the news list shows it', async ({ page }) => {
  const title = `Gate seven news ${Date.now()}`
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: NEWS.task, exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Titel', { exact: true }).fill(title)
  const date = sheet.getByLabel(/^Datum/)
  if (!await date.inputValue()) await date.fill(new Date().toISOString().slice(0, 10))
  await sheet.getByRole('textbox', { name: 'Text', exact: true }).click()
  await page.keyboard.type('The river bank is clean again. Thank you to everyone who came.')
  // The publish step of a create task: "Publish" is the main action (TEMPLATES.md §7.3).
  await sheet.getByRole('button', { name: 'Veröffentlichen', exact: true }).click()
  await expect(sheet).toHaveCount(0)

  // Wrong behaviour caught: a post that stays a draft (never on the site) after "Publish".
  await expect(async () => {
    await page.goto(`${studio.siteUrl}${NEWS.path}`)
    const row = page.getByRole('listitem').filter({ hasText: title })
    await expect(row.getByRole('link', { name: title, exact: true })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 60_000 })
})
