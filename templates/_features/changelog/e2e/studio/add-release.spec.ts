// Gate 7 job (spec TEMPLATES.md §5, saas: "changelog entry, weekly"): the owner enters a release on Today (version,
// date, text) and publishes it. The changelog page lists it first, under its own anchor, and the home page names it as
// the newest release. Not synced into a template; run by `pnpm templates test <name> --platform`.
import { expect, test } from '@playwright/test'
import { job, studio } from '../../../../../scripts/templates/e2e/studio.ts'

// The template's names for this job come from "release": { task, path, home } in templates/_studio/<template>/jobs.json:
// the label of the changelog brick's create task, the changelog page and the page that shows the newest release.
const RELEASE = job('release', ['task', 'path', 'home'])

test('the owner publishes a release, and the changelog and the home page show it', async ({ page }) => {
  const stamp = Date.now()
  // A version newer than every sample release; its anchor is the one releaseAnchor() makes (9.9.123 -> v9-9-123).
  const version = `9.9.${stamp % 100_000}`
  const text = `Gate seven release ${stamp}: shift swaps need one tap less.`
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: RELEASE.task, exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Version', { exact: true }).fill(version)
  const date = sheet.getByLabel(/^Datum/)
  if (!await date.inputValue()) await date.fill(new Date().toISOString().slice(0, 10))
  await sheet.getByRole('textbox', { name: 'Text', exact: true }).click()
  await page.keyboard.type(text)
  // The changelog keeps drafts, so the create task ends in the publish step (TEMPLATES 7.3).
  await sheet.getByRole('button', { name: 'Veröffentlichen', exact: true }).click()
  await expect(sheet).toHaveCount(0)

  // Wrong behaviour caught: a release that stays a draft, is listed below older ones (wrong order by date), or has no
  // anchor of its own, so the links from the home page and the feed lead nowhere.
  await expect(async () => {
    await page.goto(`${studio.siteUrl}${RELEASE.path}`)
    const first = page.locator('[data-release]').first()
    await expect(first).toHaveAttribute('id', `v${version.replaceAll('.', '-')}`, { timeout: 2_000 })
    await expect(first).toContainText(text, { timeout: 2_000 })
  }).toPass({ timeout: 60_000 })
  await page.goto(`${studio.siteUrl}${RELEASE.home}`)
  await expect(page.locator(`a[href$="#v${version.replaceAll('.', '-')}"]`).first()).toBeVisible()
})
