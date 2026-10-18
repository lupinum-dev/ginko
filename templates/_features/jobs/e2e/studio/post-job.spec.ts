// Gate 7 job (spec TEMPLATES.md §5, company: "job ad, monthly"; must never: "expired job online"): the owner posts a
// job with its last day, and the jobs list shows the job with that day. Not synced into a template; run by
// `pnpm templates test <name> --platform`.
import { expect, test } from '@playwright/test'
import { job, studio } from '../../../../../scripts/templates/e2e/studio.ts'

// The template's names for this job come from "job": { task, path, language } in templates/_studio/<template>/jobs.json:
// the label of the jobs brick's create task, the jobs list's address and the main language's tag for dates ("en-GB").
const JOB = job('job', ['task', 'path', 'language'])

test('the owner posts a job with its last day, and the jobs list shows both', async ({ page }) => {
  const title = `Gate seven pump fitter ${Date.now()}`
  const lastDay = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
  const shown = new Intl.DateTimeFormat(JOB.language, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${lastDay}T12:00:00Z`))
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: JOB.task, exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Titel', { exact: true }).fill(title)
  await sheet.getByLabel(/^Kurzbeschreibung/).fill('Install and service pumps on site, with a company van.')
  await sheet.getByLabel(/^Ort/).fill('Bielefeld')
  await sheet.getByRole('radio', { name: 'Vollzeit' }).check()
  await sheet.getByLabel(/^Ausgeschrieben bis/).fill(lastDay)
  await sheet.getByRole('textbox', { name: 'Beschreibung', exact: true }).click()
  await page.keyboard.type('You install and service pumps at our customers.')
  await sheet.getByRole('button', { name: 'Speichern' }).click()
  await expect(sheet).toHaveCount(0)

  // Wrong behaviour caught: the job missing from the list, or listed without its last day (an ad must end by itself).
  await expect(async () => {
    await page.goto(`${studio.siteUrl}${JOB.path}`)
    const row = page.getByRole('listitem').filter({ hasText: title })
    await expect(row).toContainText(shown, { timeout: 2_000 })
  }).toPass({ timeout: 60_000 })
})
