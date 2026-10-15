// Gate 7 job (spec TEMPLATES.md §5, starter: "edit page, monthly"): the owner changes the text of the About page in the
// Studio, and the site shows it. Not synced into a template; run by `pnpm templates test <name> --platform`.
import { expect, test } from '@playwright/test'
import { job, studio } from '../../../../../scripts/templates/e2e/studio.ts'

// The template's names for this job come from "page": { brick, title, path, bodyField } in templates/_studio/<template>/jobs.json:
// the pages brick key, the page entry title, its address on the site, and the label of the Markdown field with the page text.
const PAGE = job('page', ['brick', 'title', 'path', 'bodyField'])

test('the owner edits the page text and the site shows it', async ({ page, request }) => {
  const sentence = `Gate seven checked this sentence ${Date.now()}.`
  await page.goto(`/s/${studio.site}/all/${PAGE.brick}`)
  await page.getByRole('link', { name: PAGE.title, exact: true }).click()
  const body = page.getByLabel(PAGE.bodyField, { exact: true })
  await body.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(`\n\n${sentence}`)
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible()
  await expect(page.getByText('Nicht gespeichert')).toHaveCount(0)

  await expect.poll(async () => (await request.get(`${studio.siteUrl}${PAGE.path}`)).text(), { timeout: 60_000 }).toContain(sentence)
})
