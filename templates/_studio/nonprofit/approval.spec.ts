// Gate 7 job (spec TEMPLATES.md §5, nonprofit: "post news, weekly, volunteers with approval"; must never: "volunteer
// text online without check"). A volunteer (a staff member, not a manager) writes a news post. The sheet offers "Zur
// Prüfung senden" and no "Veröffentlichen", and the post is not on the site. A manager opens "Prüfen" and approves it;
// then the news list shows it. At the end the post is removed again. The volunteer's session comes from the setup
// (scripts/templates/e2e/studio-setup.ts, TEMPLATE_AUTH_STAFF); the admin's is the manager. Not synced into a template;
// run by `pnpm templates test nonprofit --platform`.
import { expect, test } from '@playwright/test'
import { job, studio } from '../../../scripts/templates/e2e/studio.ts'

// The template's names come from "approval": { task, path } in templates/_studio/nonprofit/jobs.json: the label of the
// posts brick's create task (the right the volunteer got) and the news list's address.
const APPROVAL = job('approval', ['task', 'path'])

test.use({ storageState: process.env.TEMPLATE_AUTH_STAFF })

test('a volunteer sends a news post for review, and it is online only after a manager approves it', async ({ page, browser }) => {
  const title = `Gate seven volunteer news ${Date.now()}`
  const onSite = async () => {
    await page.goto(`${studio.siteUrl}${APPROVAL.path}`)
    return page.getByRole('link', { name: title, exact: true })
  }

  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: APPROVAL.task, exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Titel', { exact: true }).fill(title)
  const date = sheet.getByLabel(/^Datum/)
  if (!await date.inputValue()) await date.fill(new Date().toISOString().slice(0, 10))
  await sheet.getByRole('textbox', { name: 'Text', exact: true }).click()
  await page.keyboard.type('The volunteers cleaned the river bank. This text waits for a check.')

  // Wrong behaviour caught: a volunteer who can press "Veröffentlichen" puts text online without anyone checking it.
  await expect(sheet.getByRole('button', { name: 'Zur Prüfung senden', exact: true })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Veröffentlichen', exact: true })).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Zur Prüfung senden', exact: true }).click()
  // The status the Studio shows after sending: the sheet stays open and says the post waits (Today says it too).
  await expect(sheet.getByRole('status')).toHaveText('Wartet auf Freigabe')
  await sheet.getByRole('button', { name: 'Schließen', exact: true }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByText(`„${title}“ anlegen · Wartet auf Freigabe`)).toBeVisible()

  // Wrong behaviour caught: the post is online although nobody approved it. A short wait only; that the site does
  // update within a minute is shown by the approval step below.
  await page.waitForTimeout(5_000)
  await expect(await onSite()).toHaveCount(0)

  const manager = await browser.newContext({ storageState: process.env.TEMPLATE_AUTH })
  const admin = await manager.newPage()
  try {
    await admin.goto(`/s/${studio.site}/review`, { waitUntil: 'networkidle' })
    const row = admin.getByRole('listitem').filter({ hasText: title })
    await row.getByRole('button').first().click()
    await row.getByRole('button', { name: 'Freigeben', exact: true }).click()
    // The status the Studio shows after approving.
    await expect(admin.getByText(/^Freigegeben\./)).toBeVisible()

    // Wrong behaviour caught: an approved post that never reaches the news list.
    await expect(async () => {
      await expect(await onSite()).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 60_000 })
  } finally {
    // Leave the site as found: remove the post (it sits in the trash for 30 days).
    await admin.goto(`/s/${studio.site}/all/posts`, { waitUntil: 'networkidle' })
    await admin.getByRole('link', { name: title, exact: true }).first().click()
    // The editor offers removal in "Mehr" › "Eintrag entfernen …"; "Entfernen" is the dialog's confirm button.
    await admin.getByRole('main').getByRole('button', { name: 'Mehr', exact: true }).click()
    await admin.getByRole('menuitem', { name: /^Eintrag entfernen/ }).click()
    await admin.getByRole('dialog').getByRole('button', { name: /^(Trotzdem )?[Ee]ntfernen$/ }).click()
    await expect(async () => {
      await expect(await onSite()).toHaveCount(0, { timeout: 2_000 })
    }).toPass({ timeout: 60_000 })
    await manager.close()
  }
})
