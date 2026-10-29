// Gate 7 job (spec TEMPLATES.md §5, portfolio: "new project, monthly; add photos, monthly"; must never: "photo without
// description"): the owner adds a project on Today with its facts, a main photo and two more photos, each with its
// description, and publishes it. The projects page lists it, and the project's page shows every photo with its
// description, served by the platform. Run by `pnpm templates test portfolio --platform`.
import { expect, test, type Locator } from '@playwright/test'
import { pngBytes } from '../../../apps/platform/e2e/local.ts'
import { job, studio } from '../../../scripts/templates/e2e/studio.ts'

// The portfolio's names for this job come from "project": { task, path } in jobs.json: the label of the projects
// brick's create task and the projects page.
const PROJECT = job('project', ['task', 'path'])

/** Uploads a photo into one image field of the sheet (a phone or desk picks it the same way) and describes it. */
async function addPhoto(field: Locator, name: string, shade: number, description: string) {
  await field.locator('input[type=file]').setInputFiles({ name, mimeType: 'image/png', buffer: pngBytes(shade) })
  // Saving waits for a photo that is still processed; the preview means it is ready.
  await expect(field.locator('figure img')).toBeVisible({ timeout: 60_000 })
  await field.getByLabel('Bildbeschreibung', { exact: true }).fill(description)
}

test('the owner adds a project with described photos, and its page shows them', async ({ page, request }) => {
  test.setTimeout(4 * 60_000)
  const stamp = Date.now()
  const title = `Gate seven project ${stamp}`
  const descriptions = [`Oak shelf along the hallway ${stamp}`, `Reading corner by the window ${stamp}`, `Lamp over the dining table ${stamp}`]
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: PROJECT.task, exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Titel', { exact: true }).fill(title)
  await sheet.getByLabel(/^Kurzbeschreibung/).fill('A flat in Ottensen with built-in shelves and new light.')
  await sheet.getByLabel(/^Auftraggeber/).fill('Private client')
  await sheet.getByLabel(/^Ort/).fill('Hamburg')
  await addPhoto(sheet.getByRole('group', { name: /^Bild( \(optional\))?$/ }), `gate-seven-main-${stamp}.png`, 40, descriptions[0]!)
  for (const [i, description] of descriptions.slice(1).entries()) {
    await sheet.getByRole('button', { name: 'Foto hinzufügen', exact: true }).click()
    await addPhoto(sheet.locator('[data-row]').last(), `gate-seven-photo-${i}-${stamp}.png`, 120 + i * 60, description)
  }
  await sheet.getByRole('textbox', { name: 'Text', exact: true }).click()
  await page.keyboard.type('Shelves along the hallway, a reading corner and one lamp over the table.')
  // A create task ends in the publish step (TEMPLATES 7.3).
  await sheet.getByRole('button', { name: 'Veröffentlichen', exact: true }).click()
  await expect(sheet).toHaveCount(0)

  // Wrong behaviour caught: a project that stays a draft after "Veröffentlichen", a photo that is saved but not on its
  // page or online without its description, or a photo whose address does not load from the platform.
  let href = ''
  await expect(async () => {
    await page.goto(`${studio.siteUrl}${PROJECT.path}`)
    href = (await page.getByRole('link', { name: title }).first().getAttribute('href', { timeout: 2_000 }))!
  }).toPass({ timeout: 60_000 })
  await page.goto(`${studio.siteUrl}${href}`)
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  for (const description of descriptions) {
    const image = page.locator(`main img[alt="${description}"]`)
    await expect(image.first()).toBeVisible()
    const src = await image.first().evaluate((img: HTMLImageElement) => img.currentSrc || img.src)
    const file = await request.get(new URL(src, studio.siteUrl).href)
    expect(file.status(), `the photo "${description}" loads`).toBe(200)
    expect(file.headers()['content-type']).toMatch(/^image\//)
  }
})
