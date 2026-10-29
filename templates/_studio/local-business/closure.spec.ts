// Gate 7 job (spec TEMPLATES.md §5, local-business: "closed / holiday, monthly, phone"; must never: "wrong hours"): the
// owner enters a closure of three days next week in "Schließtage und Ausnahmen" with a reason, and the contact page
// lists it among the closures ahead. The closure is removed at the end, so the other specs of the run see the usual
// hours. Run by `pnpm templates test local-business --platform`.
import { expect, test, type Page } from '@playwright/test'
import { job, studio } from '../../../scripts/templates/e2e/studio.ts'

// The practice's names for this job come from "closure": { task, add, path } in jobs.json: the label of the hours
// brick's closures task, the label of its add-row button and a page that lists the closures ahead (HoursTable).
const CLOSURE = job('closure', ['task', 'add', 'path'])
const DAY = 86_400_000
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10)

/** The closures task's sheet, opened from Today. */
async function openClosures(page: Page) {
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: CLOSURE.task, exact: true }).click()
  return page.getByRole('dialog')
}

test('the owner enters a closure with a reason, and the contact page lists it', async ({ page }) => {
  const reason = `Gate seven training ${Date.now()}`
  // Next week: inside the 90 days the site announces, and never today, so the today line of the other specs stays.
  const [from, to] = [day(8), day(10)]
  let sheet = await openClosures(page)
  await sheet.getByRole('button', { name: CLOSURE.add, exact: true }).click()
  const row = sheet.locator('[data-row]').last()
  await row.getByLabel('von', { exact: true }).fill(from)
  await row.getByLabel('bis', { exact: true }).fill(to)
  await row.getByLabel(/^Grund/).fill(reason)
  // A new exception is a closure unless the owner says otherwise.
  await expect(row.getByRole('switch', { name: /^Geschlossen/ }).or(row.getByRole('checkbox', { name: /^Geschlossen/ }))).toBeChecked()
  await sheet.getByRole('button', { name: 'Veröffentlichen' }).click()
  await expect(sheet).toHaveCount(0)

  try {
    // Wrong behaviour caught: a closure the owner entered that the site does not announce, so patients come to a
    // closed door (the list of closures ahead reads the exceptions from the Studio's data).
    await expect(async () => {
      await page.goto(`${studio.siteUrl}${CLOSURE.path}`)
      const line = page.getByRole('listitem').filter({ hasText: reason })
      await expect(line).toBeVisible({ timeout: 2_000 })
      // The dates of the closure, not just the reason: the line starts with them, the first day among them.
      await expect(line.locator('span').first()).toContainText(String(Number(from.slice(8))), { timeout: 2_000 })
    }).toPass({ timeout: 60_000 })
  } finally {
    // Undo: the row is removed again.
    sheet = await openClosures(page)
    // A row's title is its reason.
    const added = sheet.locator('[data-row]').filter({ hasText: reason })
    await added.getByRole('button', { name: /entfernen$/ }).click()
    await sheet.getByRole('button', { name: 'Veröffentlichen' }).click()
    await expect(sheet).toHaveCount(0)
  }
})
