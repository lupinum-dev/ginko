// Gate 7 job (spec TEMPLATES.md §5, events: "during: change a session, daily, phone"): on a phone, the organiser picks
// a session in "change a session", moves it to another time and room, and the programme shows the new time and room.
// Not synced into a template; run by `pnpm templates test <name> --platform`.
import { expect, test } from '@playwright/test'
import { job, studio } from '../../../../../scripts/templates/e2e/studio.ts'

// The template's names for this job come from "session": { task, title, path } in templates/_studio/<template>/jobs.json:
// the label of the sessions brick's change task, the title of a session that is still to come (main language) and
// the programme's address.
const SESSION = job('session', ['task', 'title', 'path'])

test.use({ viewport: { width: 390, height: 844 } })

test('on a phone the organiser moves a session to another time and room, and the programme shows it', async ({ page }) => {
  const room = `Gate seven room ${Date.now()}`
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: SESSION.task, exact: true }).click()
  // The task first asks which session.
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${SESSION.title}`) }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel(/^Beginn/).fill('13:05')
  await sheet.getByLabel(/^Ende/).fill('13:50')
  await sheet.getByLabel(/^Raum/).fill(room)
  await sheet.getByRole('button', { name: 'Speichern' }).click()
  await expect(sheet).toHaveCount(0)

  // Wrong behaviour caught: the programme keeps the old time or room (a wrong session time or room must never stay
  // online). The session's row on the site's programme shows both.
  await expect(async () => {
    await page.goto(`${studio.siteUrl}${SESSION.path}`)
    const row = page.getByRole('listitem').filter({ has: page.getByText(SESSION.title, { exact: true }) }).last()
    await expect(row).toContainText(room, { timeout: 2_000 })
    await expect(row.locator('[data-session-time]')).toHaveText(/^13:05\W+13:50$/, { timeout: 2_000 })
  }).toPass({ timeout: 60_000 })
})
