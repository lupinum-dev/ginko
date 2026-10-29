// Gate 7 job (spec TEMPLATES.md §5, restaurant: "fully booked, weekly, phone at the pass"): the owner marks tonight as
// fully booked with one tap on "Heute ausgebucht" (the gastro notices quick task: a notice that is shown until today),
// the Studio lists it as running until today, and the site's reservations page says it. The owner then removes the
// notice, so the other specs of the run see a normal evening. Run by `pnpm templates test restaurant --platform`.
import { expect, test } from '@playwright/test'
import { job, studio } from '../../../scripts/templates/e2e/studio.ts'

// The restaurant's names for this job come from "fullyBooked": { task, textField, shown, path } in jobs.json: the label of
// the notices quick task, a regex for its text field, the Studio's words for "until today" and the reservations page.
const BOOKED = job('fullyBooked', ['task', 'textField', 'shown', 'path'])

test('the owner marks tonight as fully booked, the reservations page says so, and the owner lifts it', async ({ page, request }) => {
  const text = `Gate seven fully booked ${Date.now()}`
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: BOOKED.task, exact: true }).click()
  const sheet = page.getByRole('dialog')
  // The task is prefilled with today as the last day; the owner only has to save (the text is replaced to find it again).
  await sheet.getByLabel(new RegExp(BOOKED.textField)).fill(text)
  await sheet.getByRole('button', { name: 'Veröffentlichen' }).click()
  await expect(sheet).toHaveCount(0)
  // The Studio lists the notice with how long it runs.
  const row = page.getByRole('main').getByRole('listitem').filter({ hasText: text })
  await expect(row).toContainText(BOOKED.shown)

  // Wrong behaviour caught: the reservations page (where guests look before they call) does not say "fully booked".
  await expect.poll(async () => (await request.get(`${studio.siteUrl}${BOOKED.path}`)).text(), { timeout: 60_000 }).toContain(text)

  // Undo: the owner removes the notice; the site stops saying it.
  await row.getByRole('button', { name: 'Entfernen' }).click()
  await expect(page.getByRole('main').getByText(text)).toHaveCount(0)
  await expect.poll(async () => (await request.get(`${studio.siteUrl}${BOOKED.path}`)).text(), { timeout: 60_000 }).not.toContain(text)
})
