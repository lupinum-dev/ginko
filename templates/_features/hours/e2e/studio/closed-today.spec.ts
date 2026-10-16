// Gate 7 job (spec TEMPLATES.md §5, restaurant: "closed today / holiday, weekly, phone at the pass"): the owner closes
// today with a reason, the Studio's hours line says so, and the site's today line ("Closed today" and the reason) does
// too. The closure is lifted at the end, so the other specs of the run see a normal day. Not synced into a template;
// run by `pnpm templates test <name> --platform`.
import { expect, test } from '@playwright/test'
import { job, studio } from '../../../../../scripts/templates/e2e/studio.ts'

// The template's names for this job come from "closedToday": { task, reasonField, todayLine, path } in
// templates/_studio/<template>/jobs.json: the label of the hours brick's closed-today task, the label of its reason
// field, the site's words for "closed today" (i18n/hours, now.closed) and a page that shows the today line.
const CLOSED = job('closedToday', ['task', 'reasonField', 'todayLine', 'path'])

test('the owner closes today with a reason, and the site says so', async ({ page, request }) => {
  const reason = `Gate seven private party ${Date.now()}`
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: CLOSED.task, exact: true }).click()
  const sheet = page.getByRole('dialog')
  // The task starts on today: one tap for the day, then the reason.
  await expect(sheet.getByRole('button', { name: 'Heute', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByLabel(new RegExp(`^${CLOSED.reasonField}`)).fill(reason)
  await sheet.getByRole('button', { name: 'Speichern' }).click()
  await expect(sheet).toHaveCount(0)
  // Today's hours line on the Studio names the closure and its reason.
  await expect(page.getByRole('main').getByText(reason)).toBeVisible()

  // Wrong behaviour caught: the site still says "open" (the today line reads the closure from the Studio's data).
  await expect.poll(async () => {
    const html = await (await request.get(`${studio.siteUrl}${CLOSED.path}`)).text()
    return html.includes(CLOSED.todayLine) && html.includes(reason)
  }, { timeout: 60_000 }).toBe(true)

  await page.getByRole('button', { name: 'Aufheben' }).click()
  await expect(page.getByRole('main').getByText(reason)).toHaveCount(0)
})
