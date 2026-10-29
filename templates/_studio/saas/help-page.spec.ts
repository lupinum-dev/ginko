// Gate 7 job (spec TEMPLATES.md §5, saas: "help page, rare"): the owner adds a sentence to a page of the help center
// (the `docs` brick of @lupinum/ginko-docs at /help) in Inhalte, and the help page shows it inside the site's layout.
// Run by `pnpm templates test saas --platform`.
import { expect, test } from '@playwright/test'
import { job, publishNow, studio } from '../../../scripts/templates/e2e/studio.ts'

// The names for this job come from "help": { brick, title, path, bodyField } in jobs.json: the help center's brick, a
// page's title, its address and the label of its text.
const HELP = job('help', ['brick', 'title', 'path', 'bodyField'])

test('the owner edits a help page, and the help center shows it', async ({ page }) => {
  const sentence = `Gate seven checked this help sentence ${Date.now()}.`
  await page.goto(`/s/${studio.site}/all/${HELP.brick}`)
  await page.getByRole('link', { name: HELP.title, exact: true }).click()
  const body = page.getByLabel(HELP.bodyField, { exact: true })
  await body.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(`\n\n${sentence}`)
  await publishNow(page)

  // Wrong behaviour caught: the help center keeps the old text after a save in the Studio (the docs layer reads its
  // pages from files only), or shows the page without the site's header (the embedded layout lost on the platform).
  await expect(async () => {
    await page.goto(`${studio.siteUrl}${HELP.path}`)
    await expect(page.getByRole('main')).toContainText(sentence, { timeout: 2_000 })
    await expect(page.getByRole('banner')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 60_000 })
})
