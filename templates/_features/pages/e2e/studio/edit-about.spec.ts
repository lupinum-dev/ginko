// Gate 7 job (spec TEMPLATES.md §5, starter: "edit page, monthly"): the owner changes the text of the About page in the
// Studio, and the site shows it. Not synced into a template; run by `pnpm templates test <name> --platform`.
import { expect, test } from '@playwright/test'
import { studio } from '../../../../../scripts/templates/e2e/studio.ts'

// The template's names for this job, in one place. Adapt here when the brick, the page or its field is renamed.
const PAGE = {
  brick: 'pages', // key of the brick in ginko.config.ts
  title: 'About', // title of the page entry
  path: '/about', // its address on the site
  bodyField: 'Text', // label of the Markdown field that holds the page text
}

test('the owner edits the About text and the site shows it', async ({ page, request }) => {
  const sentence = `Gate seven checked this sentence ${Date.now()}.`
  await page.goto(`/s/${studio.site}/all/${PAGE.brick}`)
  await page.getByRole('link', { name: PAGE.title, exact: true }).click()
  const body = page.getByLabel(PAGE.bodyField, { exact: true })
  await body.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(`\n\n${sentence}`)
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Gespeichert').first()).toBeVisible()

  await expect.poll(async () => (await request.get(`${studio.siteUrl}${PAGE.path}`)).text(), { timeout: 60_000 }).toContain(sentence)
})
