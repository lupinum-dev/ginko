// Gate 7 job (spec TEMPLATES.md §5, blog: "write, schedule, publish, weekly"; must never: "publish by accident"): the
// owner writes a post on Today and plans it for a few minutes ahead with "Später veröffentlichen". Today lists it with
// the time it goes online, the site does not show it before that time, and shows it after. Run by
// `pnpm templates test blog --platform`.
import { expect, test } from '@playwright/test'
import { job, studio } from '../../../scripts/templates/e2e/studio.ts'

// The blog's names for this job come from "news": { task, path } in jobs.json (the same as the shared news-post job):
// the label of the posts brick's create task and the list of all posts.
const NEWS = job('news', ['task', 'path'])
/** How far ahead the post is planned. The server publishes at that minute; the site shows it within about a minute. */
const AHEAD_MINUTES = 3

test('the owner plans a post, Today says when it goes online, and the site shows it only from then', async ({ page }) => {
  test.setTimeout(8 * 60_000)
  const title = `Gate seven planned post ${Date.now()}`
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: NEWS.task, exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Titel', { exact: true }).fill(title)
  const date = sheet.getByLabel(/^Datum/)
  if (!await date.inputValue()) await date.fill(new Date().toISOString().slice(0, 10))
  await sheet.getByRole('textbox', { name: 'Text', exact: true }).click()
  await page.keyboard.type('The swifts are back over the car park.')

  // "Später veröffentlichen" opens one date-and-time input in the site's time zone. Its `min` is the current minute in
  // that zone, so the planned time is that plus a few minutes, without knowing the zone here. The post is due at the
  // earliest at `due` (the minute of `before`, plus the minutes ahead).
  const before = Date.now()
  await sheet.getByRole('button', { name: 'Später veröffentlichen', exact: true }).click()
  const when = sheet.getByLabel('Datum und Uhrzeit', { exact: true })
  const now = await when.getAttribute('min')
  if (!now) throw new Error('The date-and-time input has no min (the site\'s current time)')
  await when.fill(new Date(Date.parse(`${now.slice(0, 16)}:00Z`) + AHEAD_MINUTES * 60_000).toISOString().slice(0, 16))
  const due = Math.floor(before / 60_000) * 60_000 + AHEAD_MINUTES * 60_000
  await sheet.getByRole('button', { name: 'Planen', exact: true }).click()
  await expect(sheet).toHaveCount(0)

  // Today lists the post among the drafts with the time it goes online (TEMPLATES 7.2), so the owner sees it is planned.
  const row = page.locator('[data-test=today-drafts] li').filter({ hasText: title })
  await expect(row).toContainText('Geht online')

  // Wrong behaviour caught: a planned post that goes online at once (published by accident), or one that never goes
  // online (the planned publish does not run, or the site does not pick it up).
  const listed = async () => {
    await page.goto(`${studio.siteUrl}${NEWS.path}`)
    return page.getByRole('listitem').filter({ hasText: title }).getByRole('link', { name: title, exact: true })
  }
  let seen = 0
  await expect(async () => {
    const link = await listed()
    if (await link.count()) seen ||= Date.now()
    await expect(link).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: (AHEAD_MINUTES + 3) * 60_000, intervals: [10_000] })
  expect(seen, `the post went online before its planned time (${new Date(due).toISOString()})`).toBeGreaterThanOrEqual(due)
})
