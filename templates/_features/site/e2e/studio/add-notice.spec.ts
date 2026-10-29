// Gate 7 job (spec TEMPLATES.md §5, starter: "notice, rare"): the owner puts a notice on the site, and the home page
// shows it. Not synced into a template; run by `pnpm templates test <name> --platform`.
import { expect, test } from '@playwright/test'
import { job, studio } from '../../../../../scripts/templates/e2e/studio.ts'

// The template's names for this job come from "notice": { createTask, textField } in
// templates/_studio/<template>/jobs.json: createTask = the label of the notices create task (basics notices():
// "Hinweis hinzufügen"), textField = regex for the label of the notice text.
const NOTICE = job('notice', ['createTask', 'textField'])

test('the owner adds a notice and the home page shows it', async ({ page, request }) => {
  const text = `Gate seven notice ${Date.now()}`
  // Task buttons live on the site's Today page (the Studio start page), not on the brick's list.
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: NOTICE.createTask }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel(new RegExp(NOTICE.textField)).fill(text)
  await sheet.getByRole('button', { name: 'Veröffentlichen', exact: true }).click()
  await expect(sheet).toHaveCount(0)

  await expect.poll(async () => (await request.get(`${studio.siteUrl}/`)).text(), { timeout: 60_000 }).toContain(text)
})
