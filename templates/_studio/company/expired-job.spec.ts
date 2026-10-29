// Gate 7 job (spec TEMPLATES.md §5, company; must never: "expired job online"): the owner posts a job whose last day is
// already past, and the site does not list it: not on the jobs page, not as a page of its own, not in the sitemap. A job
// that is still open, posted right after, is the control: once the site shows it, the site has the data of the expired
// job too, so its absence means something. Both jobs are removed at the end. Not synced into a template; run by
// `pnpm templates test <name> --platform`.
import { expect, test, type Page } from '@playwright/test'
import { job, studio } from '../../../scripts/templates/e2e/studio.ts'

// The template's names for this job come from "job": { task, path } in templates/_studio/<template>/jobs.json:
// the label of the jobs brick's create task and the jobs list's address.
const JOB = job('job', ['task', 'path'])
const DAY = 86_400_000

/** Posts a job in the Studio and returns the text of the confirmation the Studio shows after the save. */
async function postJob(page: Page, title: string, lastDay: string) {
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: JOB.task, exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Titel', { exact: true }).fill(title)
  await sheet.getByLabel(/^Kurzbeschreibung/).fill('Install and service pumps on site.')
  await sheet.getByLabel(/^Ort/).fill('Bielefeld')
  await sheet.getByRole('radio', { name: 'Vollzeit' }).check()
  await sheet.getByLabel(/^Ausgeschrieben bis/).fill(lastDay)
  await sheet.getByRole('textbox', { name: 'Beschreibung', exact: true }).click()
  await page.keyboard.type('Gate seven test job, removed at the end of the run.')
  await sheet.getByRole('button', { name: 'Veröffentlichen' }).click()
  await expect(sheet).toHaveCount(0)
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Veröffentlicht' })
  await expect(toast).toBeVisible()
  return (await toast.innerText()).replace(/\s+/g, ' ').trim()
}

/**
 * Removes a job with the "{title} entfernen" button on its row in the jobs area of "Heute" (it goes to the trash for
 * 30 days, without a question). A job past its last day is not in the list until "Abgelaufene anzeigen" is pressed.
 */
async function removeJob(page: Page, title: string) {
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  const row = page.getByRole('button', { name: `${title} entfernen`, exact: true })
  if (!(await row.isVisible())) await page.getByRole('button', { name: /^Abgelaufene anzeigen/ }).click()
  // The row button removes at once (Studio: pages/s/[site]/index.vue removeEntry; it asks first only when other entries use
  // the job or the trash is full) and shows the toast "{title} entfernt" with "Rückgängig".
  await row.click()
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: title })).toBeVisible()
}

test('a job whose last day is past is not on the jobs page, as a page or in the sitemap', async ({ page, request }) => {
  const stamp = Date.now()
  const expired = { title: `Gate seven expired fitter ${stamp}`, slug: `gate-seven-expired-fitter-${stamp}`, lastDay: new Date(stamp - 3 * DAY).toISOString().slice(0, 10) }
  const control = { title: `Gate seven open fitter ${stamp}`, slug: `gate-seven-open-fitter-${stamp}`, lastDay: new Date(stamp + 30 * DAY).toISOString().slice(0, 10) }

  const status = await postJob(page, expired.title, expired.lastDay)
  console.log(`Studio status after saving the expired job: ${status}`)
  await postJob(page, control.title, control.lastDay)
  try {
    // The control job is on the jobs page, in the sitemap and has a page: the site has caught up with both saves.
    await expect(async () => {
      await page.goto(`${studio.siteUrl}${JOB.path}`)
      await expect(page.getByRole('listitem').filter({ hasText: control.title })).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 60_000 })
    expect((await request.get(`${studio.siteUrl}${JOB.path}/${control.slug}`)).status()).toBe(200)
    await expect.poll(async () => (await request.get(`${studio.siteUrl}/sitemap.xml`)).text(), { timeout: 60_000 }).toContain(control.slug)

    // Wrong behaviour caught: an ad past its last day still listed, still opening, or still offered to search engines.
    await expect(page.getByText(expired.title)).toHaveCount(0)
    expect((await request.get(`${studio.siteUrl}${JOB.path}/${expired.slug}`)).status()).toBe(404)
    expect(await (await request.get(`${studio.siteUrl}/sitemap.xml`)).text()).not.toContain(expired.slug)
  } finally {
    await removeJob(page, control.title)
    await removeJob(page, expired.title)
  }
})
