// Gate 7 job (spec TEMPLATES.md §5, docs: "edit page, weekly; outdated translation, weekly"): the owner adds a sentence
// to an English page, and the docs page and its Markdown twin show it. Inhalte > Übersetzungen then lists the German
// page as outdated; the owner opens it from there, adds the German sentence, and the German page shows it and leaves
// the list. Run by `pnpm templates test docs --platform`.
import { expect, test, type Page } from '@playwright/test'
import { job, studio } from '../../../scripts/templates/e2e/studio.ts'

// The docs site's names for this job come from "docPage": { brick, title, path, translatedPath, language, bodyField }
// in jobs.json: the docs brick, a page that has a German translation, its English and German addresses, the Studio's
// name of the second language and the label of the page text.
const DOC = job('docPage', ['brick', 'title', 'path', 'translatedPath', 'language', 'bodyField'])

/** Adds a paragraph at the end of the open entry's text and saves it. */
async function appendAndSave(page: Page, sentence: string) {
  const body = page.getByLabel(DOC.bodyField, { exact: true })
  await body.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(`\n\n${sentence}`)
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible()
}

/** The German section of Inhalte > Übersetzungen and the page's row in it. */
async function translationRow(page: Page) {
  await page.goto(`/s/${studio.site}/all?translations`, { waitUntil: 'networkidle' })
  return page.getByRole('region', { name: DOC.language, exact: true }).getByRole('listitem').filter({ hasText: DOC.title })
}

test('the owner edits an English page, and the outdated German page is listed until it is updated', async ({ page, request }) => {
  const stamp = Date.now()
  const english = `Gate seven checked this webhook sentence ${stamp}.`
  const german = `Gate sieben hat diesen Webhook-Satz ${stamp} geprüft.`
  await page.goto(`/s/${studio.site}/all/${DOC.brick}`)
  await page.getByRole('link', { name: DOC.title, exact: true }).click()
  await appendAndSave(page, english)

  // Wrong behaviour caught: a docs page that keeps its old text after a save in the Studio (the layer reads files, or
  // a cache), or a Markdown twin (what agents and the MCP `read_doc` read) that does.
  for (const address of [DOC.path, `${DOC.path}.md`]) {
    await expect.poll(async () => (await request.get(`${studio.siteUrl}${address}`)).text(), { timeout: 60_000 }).toContain(english)
  }

  // Wrong behaviour caught: a German page that still shows the old text and is not listed, so nobody updates it.
  const row = await translationRow(page)
  await expect(row).toContainText('veraltet')
  await row.getByRole('link', { name: DOC.title }).click()
  await expect(page.getByText(/geändert seit Übersetzung/).first()).toBeVisible()
  await appendAndSave(page, german)
  await expect.poll(async () => (await request.get(`${studio.siteUrl}${DOC.translatedPath}`)).text(), { timeout: 60_000 }).toContain(german)
  await expect(await translationRow(page)).toHaveCount(0)
})
