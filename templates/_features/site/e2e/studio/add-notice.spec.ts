// Gate 7 job (spec TEMPLATES.md §5, starter: "notice, rare"): the owner puts a notice on the site, and the home page
// shows it. Not synced into a template; run by `pnpm templates test <name> --platform`.
import { expect, test } from '@playwright/test'
import { job, studio } from '../../../../../scripts/templates/e2e/studio.ts'

// The template's names for this job come from "notice": { brick, textField } in templates/_studio/<template>/jobs.json:
// brick = key of the notices brick in ginko.config.ts, textField = regex for the label of the notice text (the Studio adds "(optional)").
const NOTICE = job('notice', ['brick', 'textField'])

test('the owner adds a notice and the home page shows it', async ({ page, request }) => {
  const text = `Gate seven notice ${Date.now()}`
  await page.goto(`/s/${studio.site}/all/${NOTICE.brick}`)
  await page.getByLabel(new RegExp(NOTICE.textField)).fill(text)
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible()
  await expect(page.getByText('Nicht gespeichert')).toHaveCount(0)

  await expect.poll(async () => (await request.get(`${studio.siteUrl}/`)).text(), { timeout: 60_000 }).toContain(text)
})
