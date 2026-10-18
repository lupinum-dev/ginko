// Gate 7 job (spec TEMPLATES.md §5, nonprofit: "report PDF, yearly, at the desk"): the owner uploads the annual report as
// a PDF in the Studio, and the site's reports page links it; the link answers 200 with application/pdf. The file is
// removed at the end, so the other specs of the run see the reports page as before. Not synced into a template; run by
// `pnpm templates test <name> --platform`.
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { job, studio } from '../../../scripts/templates/e2e/studio.ts'

// The template's names for this job come from "reportPdf": { task, removeTask, path } in jobs.json: the labels of the
// downloads brick's create and remove tasks and the reports page's address.
const REPORT = job('reportPdf', ['task', 'removeTask', 'path'])
const fixture = fileURLToPath(new URL('./fixtures/gate-seven-report.pdf', import.meta.url))

test('the owner uploads the report as a PDF, and the reports page links a file that opens', async ({ page, request }) => {
  const title = `Gate seven annual report ${Date.now()}`
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: REPORT.task, exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Titel', { exact: true }).fill(title)
  await sheet.getByLabel('Datum', { exact: true }).fill(new Date().toISOString().slice(0, 10))
  await sheet.locator('input[type=file]').setInputFiles(fixture)
  // The upload is checked on the server: the file name shows as a link once it is ready.
  await expect(sheet.getByRole('link', { name: 'gate-seven-report.pdf' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Speichern' }).click()
  await expect(sheet).toHaveCount(0)
  // The status the Studio shows after the save (ops.saved + ops.liveHint in the Studio's German): saved, and when it is
  // live. The site has several languages, so the same line ends with a note about untranslated texts: no exact match.
  await expect(page.getByText('Gespeichert. Auf der Website in etwa einer Minute.')).toBeVisible()

  // Wrong behaviour caught: the report is saved but the site links no file, or a link that is a 404 or not a PDF.
  let href = ''
  await expect(async () => {
    await page.goto(`${studio.siteUrl}${REPORT.path}`)
    const link = page.getByRole('link', { name: title, exact: true })
    await expect(link).toBeVisible({ timeout: 2_000 })
    href = (await link.getAttribute('href')) ?? ''
    expect(href).not.toBe('')
  }).toPass({ timeout: 60_000 })
  const response = await request.get(new URL(href, studio.siteUrl).toString())
  expect(response.status(), href).toBe(200)
  expect(response.headers()['content-type'], href).toContain('application/pdf')

  // Undo: the remove task opens a list of the files; choosing the file removes it at once (no second confirm button) and
  // the Studio says so. The reports page must stop showing the title.
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: REPORT.removeTask, exact: true }).click()
  const remove = page.getByRole('dialog', { name: REPORT.removeTask })
  await remove.getByRole('button', { name: title, exact: true }).click()
  await expect(page.getByText(`„${title}“ liegt jetzt im Papierkorb. In etwa einer Minute nicht mehr auf der Website.`)).toBeVisible()
  await expect(remove).toHaveCount(0)
  await expect(async () => {
    await page.goto(`${studio.siteUrl}${REPORT.path}`)
    await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0, { timeout: 2_000 })
  }).toPass({ timeout: 90_000 })
})
