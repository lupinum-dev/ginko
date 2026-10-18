// Gate 7 job (spec TEMPLATES.md §5, events: "before: speakers and programme", weekly, before the first day, at the
// desk): the organiser adds a speaker with a short bio, adds a session with that speaker to the programme, and the
// site shows both. A speaker without a bio makes the Studio's speakers line say so (§7 `missing: 'bio'`). Both tests
// remove what they added. Own to the events template; run by `pnpm templates test events --platform`.
import { expect, test, type Page } from '@playwright/test'
import { job, studio } from '../../../scripts/templates/e2e/studio.ts'

// The template's names come from templates/_studio/events/jobs.json: "speaker": { brick, section, field, path } (the
// people brick key, its heading and the label of its optional field on Today, both as the German Studio shows them, the speakers page) and "programme":
// { brick, event, path } (the sessions brick key, the title of the event the session belongs to, the programme page).
const SPEAKER = job('speaker', ['brick', 'section', 'field', 'path'])
const PROGRAMME = job('programme', ['brick', 'event', 'path'])

const area = (brick: string) => `/s/${studio.site}/all/${brick}`

/** Opens "Neu" in an area (Inhalte), fills what `fill` sets, saves, and returns the address of the saved entry. */
async function create(page: Page, brick: string, fill: () => Promise<void>) {
  await page.goto(area(brick), { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: 'Neu', exact: true }).click()
  await fill()
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  // The saved message (ops.saved + ops.liveHint); the short status word next to Speichern shows only for a moment.
  await expect(page.getByText('Gespeichert. Auf der Website in etwa einer Minute.')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${area(brick)}/[^/]+$`))
  return new URL(page.url()).pathname
}

/** Removes an entry through its editor ("Mehr" → "Eintrag entfernen …" → "Entfernen"). */
async function remove(page: Page, entry: string) {
  await page.goto(entry, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Mehr', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Eintrag entfernen …' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^Entfernen$|^Trotzdem entfernen$/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('the organiser adds a speaker and a session with that speaker, and the site shows both', async ({ page }) => {
  const name = `Gate seven Speaker ${Date.now()}`
  const bio = `Gate seven bio ${Date.now()}: turns open data into readable stories.`
  const title = `Gate seven session ${Date.now()}`
  const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
  const added: string[] = []
  try {
    added.push(await create(page, SPEAKER.brick, async () => {
      await page.getByLabel('Name', { exact: true }).fill(name)
      await page.getByLabel(/^Rolle/).fill('Data editor')
      await page.getByLabel(/^Kurzbiografie/).fill(bio)
    }))
    added.push(await create(page, PROGRAMME.brick, async () => {
      await page.getByRole('group', { name: /^Veranstaltung/ }).getByRole('combobox').click()
      await page.getByRole('option', { name: PROGRAMME.event, exact: true }).click()
      await page.getByLabel('Datum', { exact: true }).fill(day)
      await page.getByLabel(/^Beginn/).fill('10:15')
      await page.getByLabel(/^Ende/).fill('11:00')
      await page.getByLabel('Titel', { exact: true }).fill(title)
      await page.getByRole('group', { name: /^Vortragende/ }).getByRole('combobox').click()
      await page.getByRole('option', { name, exact: true }).click()
    }))

    // Wrong behaviour caught: a session saved in the Studio that the programme does not list, or lists without the
    // speaker (a visitor then cannot tell who gives the talk).
    await expect(async () => {
      await page.goto(`${studio.siteUrl}${PROGRAMME.path}`)
      const row = page.getByRole('listitem').filter({ has: page.getByText(title, { exact: true }) }).last()
      await expect(row).toContainText(name, { timeout: 2_000 })
    }).toPass({ timeout: 60_000 })

    // Wrong behaviour caught: the speaker's page without the bio the organiser wrote.
    await expect(async () => {
      await page.goto(`${studio.siteUrl}${SPEAKER.path}`)
      await page.getByRole('link', { name: new RegExp(name) }).first().click({ timeout: 2_000 })
      await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible({ timeout: 2_000 })
      await expect(page.getByText(bio, { exact: true })).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 60_000 })
  } finally {
    // Session first: it points at the speaker.
    for (const entry of added.reverse()) await remove(page, entry)
  }
})

test('a speaker without a bio shows in the Studio line of the speakers', async ({ page }) => {
  const name = `Gate seven Nobio ${Date.now()}`
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: SPEAKER.section, exact: true }) })
  const line = section.locator('[data-test="status"]')
  const countOf = async () => Number((await line.textContent({ timeout: 2_000 }).catch(() => ''))?.match(/^(\d+)/)?.[1] ?? 0)
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  const before = await countOf()

  const entry = await create(page, SPEAKER.brick, () => page.getByLabel('Name', { exact: true }).fill(name))
  try {
    // Wrong behaviour caught: the line stays silent (or keeps its old count) after a speaker without a bio was
    // saved, so the organiser never learns that a page misses its bio. The line names the count and the field.
    await expect(async () => {
      await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
      await expect(line).toHaveText(new RegExp(`^${before + 1} Eintr\\S+ ohne ${SPEAKER.field}$`), { timeout: 2_000 })
    }).toPass({ timeout: 60_000 })
  } finally {
    await remove(page, entry)
  }
})
