// Gate 7 job (spec TEMPLATES.md §5, docs: "changelog, per release"): the owner adds a release in Inhalte (version, date,
// text), publishes it now, and the changelog page lists it first under its own anchor. Run by
// `pnpm templates test docs --platform`.
import { expect, test } from '@playwright/test'
import { job, studio } from '../../../scripts/templates/e2e/studio.ts'

// The docs site's names for this job come from "release": { brick, path } in jobs.json: the changelog brick and its page.
const RELEASE = job('release', ['brick', 'path'])

test('the owner publishes a release, and the changelog lists it first', async ({ page }) => {
  const stamp = Date.now()
  // A version newer than every sample release; its anchor is the one releaseAnchor() makes (9.9.123 -> v9-9-123).
  const version = `9.9.${stamp % 100_000}`
  const text = `Gate seven release ${stamp}: monitors retry twice before they alert.`
  await page.goto(`/s/${studio.site}/all/${RELEASE.brick}/new`, { waitUntil: 'networkidle' })
  await page.getByLabel('Version', { exact: true }).fill(version)
  const date = page.getByLabel(/^Date/)
  if (!await date.inputValue()) await date.fill(new Date().toISOString().slice(0, 10))
  await page.getByRole('textbox', { name: 'Text', exact: true }).click()
  await page.keyboard.type(text)
  // The changelog keeps drafts: a new release is saved as a draft first, then published.
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click()
  await page.getByRole('button', { name: 'Veröffentlichen …', exact: true }).click()
  await page.getByRole('button', { name: 'Jetzt veröffentlichen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Zurückziehen', exact: true })).toBeVisible()

  // Wrong behaviour caught: a release that stays a draft, is listed below older ones, or has no anchor of its own.
  await expect(async () => {
    await page.goto(`${studio.siteUrl}${RELEASE.path}`)
    const first = page.locator('section.docs-release').first()
    await expect(first).toHaveAttribute('id', `v${version.replaceAll('.', '-')}`, { timeout: 2_000 })
    await expect(first).toContainText(text, { timeout: 2_000 })
  }).toPass({ timeout: 60_000 })
})
