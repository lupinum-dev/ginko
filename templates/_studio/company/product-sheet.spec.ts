// Gate 7 job (spec TEMPLATES.md §5, company: "product sheet, rare, at the desk"): the owner adds a PDF file and attaches
// it to a product as its product sheet, and the product page links it: the link answers 200 with the PDF. At the end the
// product has its old sheet again and the new file is removed. Not synced into a template; run by
// `pnpm templates test <name> --platform`.
import { expect, test, type Page } from '@playwright/test'
import { pdfBytes } from '../../../apps/platform/e2e/local.ts'
import { job, studio } from '../../../scripts/templates/e2e/studio.ts'

// The template's names for this job come from "product": { task, name, oldSheet, field, path, link, addFile, removeFile }
// in templates/_studio/<template>/jobs.json: the label of the services edit task, the product's name in the main language,
// the title of the file it has now, the label of its sheet field, the product page's address, the label of the sheet
// link on that page, and the labels of the downloads brick's add and remove tasks.
const PRODUCT = job('product', ['task', 'name', 'oldSheet', 'field', 'path', 'link', 'addFile', 'removeFile'])

/** Opens the edit task for the product, sets its sheet to the file with this title and saves. Returns the Studio's confirmation. */
async function attachSheet(page: Page, fileTitle: string) {
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: PRODUCT.task, exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${PRODUCT.name}`) }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('combobox', { name: new RegExp(`^${PRODUCT.field}`) }).click()
  await page.getByRole('option', { name: fileTitle, exact: true }).click()
  await sheet.getByRole('button', { name: 'Veröffentlichen' }).click()
  await expect(sheet).toHaveCount(0)
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Veröffentlicht' })
  await expect(toast).toBeVisible()
  return (await toast.innerText()).replace(/\s+/g, ' ').trim()
}

test('the owner attaches a PDF to a product, and the product page links it', async ({ page, request }) => {
  const stamp = Date.now()
  const fileTitle = `Gate seven sheet ${stamp}`
  const fileName = `gate-seven-sheet-${stamp}.pdf`

  // The product page links the old sheet now. The Studio serves files from its storage under an id, not under the file
  // name, so the new sheet is told apart by its address and its content.
  const sheetHref = async () => {
    await page.goto(`${studio.siteUrl}${PRODUCT.path}`)
    return (await page.getByRole('link', { name: new RegExp(PRODUCT.link) }).getAttribute('href', { timeout: 2_000 }))!
  }
  const oldHref = await sheetHref()

  // 1. The file: the downloads brick's add task, with a PDF chosen from the desk.
  await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: PRODUCT.addFile, exact: true }).click()
  const add = page.getByRole('dialog')
  await add.getByLabel('Titel', { exact: true }).fill(fileTitle)
  await add.getByLabel('Datum', { exact: true }).fill(new Date(stamp).toISOString().slice(0, 10))
  await add.locator('input[type=file]').setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: pdfBytes(`Gate seven ${stamp}`) })
  await expect(add.getByRole('link', { name: fileName })).toBeVisible({ timeout: 60_000 })
  await add.getByRole('button', { name: 'Veröffentlichen' }).click()
  await expect(add).toHaveCount(0)

  try {
    // 2. The product: its sheet is now the new file.
    const status = await attachSheet(page, fileTitle)
    console.log(`Studio status after attaching the sheet: ${status}`)

    // Wrong behaviour caught: a sheet attached in the Studio that the product page does not link, or links to a file
    // that does not open (404) or is not served as a PDF.
    let href = ''
    await expect(async () => {
      href = await sheetHref()
      expect(href).not.toBe(oldHref)
    }).toPass({ timeout: 60_000 })
    const file = await request.get(new URL(href, studio.siteUrl).href)
    expect(file.status()).toBe(200)
    expect(file.headers()['content-type']).toContain('application/pdf')
    const body = (await file.body()).toString('latin1')
    expect(body.slice(0, 5)).toBe('%PDF-')
    expect(body).toContain(`Gate seven ${stamp}`)
  } finally {
    // 3. Undo: the product has its old sheet again, then the new file is removed (while a product uses it, the Studio would ask first).
    await attachSheet(page, PRODUCT.oldSheet)
    await page.goto(`/s/${studio.site}`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: PRODUCT.removeFile, exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(fileTitle) }).click()
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: fileTitle })).toBeVisible()
  }
})
