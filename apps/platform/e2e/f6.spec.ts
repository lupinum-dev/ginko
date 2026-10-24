// Acceptance of the F6 Studio screens: Files, Review, History detail and ⌘K (UI.md 10.7, items 1-8).
// Item 10 (English and German): items 5 and 8 run again in an English browser, like language.spec.ts.
// Item 9 (a draft's "Why not on the website?") needs a collection with drafts, which the restaurant does not have
// (drafts are for blogs and news, SPEC 15); server test studio.test.ts and why-not-public.test.ts cover it.
import { execFileSync } from 'node:child_process'
import { addDays, todayIn } from '@lupinum/ginko/internal'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { STATE } from './global-setup'
import { pdfBytes, pngBytes, resetContent, serverDir } from './local'

const today = () => todayIn('Europe/Vienna')
const stamp = () => Date.now().toString(36)

test.beforeEach(() => resetContent())

/**
 * Opens a page and waits until Nuxt has hydrated it. A file chosen or a click made before that is lost, and a goto made
 * while the app still finishes its own navigation (after a save) is aborted by the browser: that one is repeated once.
 */
async function open(page: Page, url: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'networkidle' })
      break
    } catch (error) {
      if (attempt === 2 || !String(error).includes('ERR_ABORTED')) throw error
    }
  }
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

const toast = (page: Page) => page.locator('[data-sonner-toast]')
const narrow = (page: Page) => page.viewportSize()!.width < 1024

// ---- Files ----

/** Uploads through the Finder's Upload button and waits until the file is in the grid. */
async function upload(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await page.locator('input[type=file]').first().setInputFiles({ name, mimeType, buffer })
  // The new file is selected; on a phone its details open as a sheet (the owner can add the alt text at once).
  if (narrow(page)) {
    await expect(page.getByRole('dialog', { name: 'Details' }).getByRole('textbox', { name: 'Name' })).toHaveValue(name, { timeout: 30_000 })
    await page.keyboard.press('Escape')
  }
  await expect(page.getByRole('button', { name })).toBeVisible({ timeout: 30_000 })
}
const uploadPhoto = (page: Page, name: string) => upload(page, name, 'image/png', pngBytes(Date.now() % 251))
const uploadPdf = (page: Page, name: string) => upload(page, name, 'application/pdf', pdfBytes(name))

/** The details of the selected file: a column on a wide screen, a bottom sheet on the phone. */
const details = (page: Page) => (narrow(page) ? page.getByRole('dialog', { name: 'Details' }) : page.getByRole('complementary', { name: 'Details' }))

/** A view of the Finder: the sidebar on a wide screen, a select on the phone. */
async function openView(page: Page, name: string) {
  const select = page.getByRole('combobox', { name: 'Dateien' })
  if (await select.isVisible()) await select.selectOption({ label: name })
  else await page.getByRole('navigation', { name: 'Dateien' }).getByRole('button', { name }).click()
}

/** Picks a photo or PDF from the library in an open entry form. A photo asks for its alt text first. */
async function pickFromLibrary(page: Page, file: string, alt?: string) {
  await page.getByRole('button', { name: 'Aus der Bibliothek wählen' }).click()
  const picker = page.getByRole('dialog')
  await picker.getByRole('button', { name: file }).click()
  if (alt) await picker.getByLabel('Bildbeschreibung').fill(alt)
  await picker.getByRole('button', { name: alt ? 'Dieses Foto verwenden' : 'Diese Datei verwenden' }).click()
  await expect(picker).toHaveCount(0)
}

async function fillEvent(page: Page, title: string) {
  await open(page, '/s/restaurant/all/events/new')
  await page.getByLabel('Titel').fill(title)
  await page.getByLabel('von').fill(addDays(today(), 10))
  await page.getByRole('textbox', { name: 'Beschreibung' }).fill('Ein Abend mit Wein und Musik.')
}

/** The "Suchmaschinen" entry is one of the always-live ones: a photo picked there is shown by the website at once. */
async function usePhotoInSeo(page: Page, photo: string, alt: string) {
  await open(page, '/s/restaurant/all/seo')
  await pickFromLibrary(page, photo, alt)
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(toast(page)).toContainText('Gespeichert')
}

test.describe('Dateien', () => {
  test.use({ storageState: STATE.owner })

  test('1. a photo from the library for an event; without alt text the picker asks for it', async ({ page }) => {
    const photo = `f6-foto-${stamp()}.png`
    await open(page, '/s/restaurant/files')
    await uploadPhoto(page, photo)

    await fillEvent(page, `Fotoabend ${stamp()}`)
    await page.getByRole('button', { name: 'Aus der Bibliothek wählen' }).click()
    const picker = page.getByRole('dialog')
    await picker.getByRole('button', { name: photo }).click()
    const use = picker.getByRole('button', { name: 'Dieses Foto verwenden' })
    const alt = picker.getByLabel('Bildbeschreibung')
    await expect(alt).toHaveValue('')
    // Without a description the button says why instead of being disabled (d57b9a4f), and the picker stays open.
    await use.click()
    await expect(picker.getByRole('alert')).toHaveText('Beschreibe das Bild kurz, für Menschen, die es nicht sehen.')
    await expect(alt).toBeFocused()
    await expect(picker).toBeVisible()
    await alt.fill('Gedeckter Tisch im Garten')
    await expect(picker.getByRole('alert')).toHaveCount(0)
    await use.click()
    await expect(picker).toHaveCount(0)
    await expect(page.getByLabel('Bildbeschreibung')).toHaveValue('Gedeckter Tisch im Garten')

    await page.getByRole('button', { name: 'Speichern', exact: true }).click()
    await expect(toast(page)).toContainText('Gespeichert')
    await open(page, '/s/restaurant/files')
    await page.getByRole('button', { name: photo }).click()
    await expect(details(page).getByText(/Fotoabend/)).toBeVisible()
  })

  test('1b. the library picker works inside a Today task sheet (native dialog); Escape closes only the picker', async ({ page }) => {
    const photo = `f6-heute-${stamp()}.png`
    await open(page, '/s/restaurant/files')
    await uploadPhoto(page, photo)

    await open(page, '/s/restaurant')
    await page.getByRole('button', { name: 'Veranstaltung hinzufügen' }).click()
    const sheet = page.locator('dialog[open]')
    await sheet.getByLabel('Titel').fill(`Heute ${stamp()}`)
    await sheet.getByRole('button', { name: 'Aus der Bibliothek wählen' }).click()
    const picker = sheet.getByRole('dialog', { name: 'Dateien' })
    await expect(picker).toBeVisible()
    // Escape closes the picker only; the sheet stays open and does not ask about discarding.
    await page.keyboard.press('Escape')
    await expect(picker).toHaveCount(0)
    await expect(sheet).toBeVisible()
    await expect(page.getByText('Änderungen verwerfen?')).toHaveCount(0)

    await sheet.getByRole('button', { name: 'Aus der Bibliothek wählen' }).click()
    await picker.getByRole('button', { name: photo }).click()
    await picker.getByLabel('Bildbeschreibung').fill('Gedeckter Tisch im Garten')
    await picker.getByRole('button', { name: 'Dieses Foto verwenden' }).click()
    await expect(picker).toHaveCount(0)
    await expect(sheet.getByLabel('Bildbeschreibung')).toHaveValue('Gedeckter Tisch im Garten')
    await expect(sheet.locator('img')).toBeVisible()
  })

  test('2. replacing the lunch PDF: the entry shows the new file, nothing goes to the trash, the old file is kept', async ({ page }) => {
    const pdf = `f6-mittag-${stamp()}.pdf`
    await open(page, '/s/restaurant/files')
    await uploadPdf(page, pdf)

    await open(page, '/s/restaurant/all/lunch')
    await pickFromLibrary(page, pdf)
    await page.getByRole('button', { name: 'Speichern', exact: true }).click()
    await expect(toast(page)).toContainText('Gespeichert')
    const entryLink = page.getByRole('link', { name: pdf })
    const oldUrl = await entryLink.getAttribute('href')

    await open(page, '/s/restaurant/files')
    await page.getByRole('button', { name: pdf }).click()
    const panel = details(page)
    await expect(panel.getByRole('link', { name: /^Alle Gerichte inklusive/ })).toBeVisible()
    const download = panel.getByRole('link', { name: 'Herunterladen' })
    await expect(download).toHaveAttribute('href', oldUrl!)
    await panel.locator('input[type=file]').setInputFiles({ name: `ersatz-${pdf}`, mimeType: 'application/pdf', buffer: pdfBytes(`neu ${pdf}`) })
    await expect(download).not.toHaveAttribute('href', oldUrl!, { timeout: 30_000 })
    const newUrl = await download.getAttribute('href')

    // The entry that used it links the new file; the file keeps its name and is still in use, not in the trash.
    await open(page, '/s/restaurant/all/lunch')
    await expect(page.getByRole('link', { name: pdf })).toHaveAttribute('href', newUrl!)
    await open(page, '/s/restaurant/files')
    await openView(page, 'Papierkorb')
    await expect(page.getByText('Der Papierkorb ist leer.')).toBeVisible()

    // The old file stays in the storage for 30 days (`uploads.previous`); the Studio has no button for it yet.
    const rows = execFileSync('npx', ['convex', 'data', 'uploads', '--limit', '500', '--order', 'desc', '--format', 'jsonLines'], { cwd: serverDir, encoding: 'utf8' })
    const row = rows.trim().split('\n').map((l) => JSON.parse(l) as { name: string; previous?: unknown[]; trashedAt?: number }).find((r) => r.name === pdf)
    expect(row?.previous).toHaveLength(1)
    expect(row?.trashedAt).toBeUndefined()
  })

  test('3. a used photo cannot be removed: the dialog lists where it is used and has no destructive button', async ({ page }) => {
    const photo = `f6-benutzt-${stamp()}.png`
    await open(page, '/s/restaurant/files')
    await uploadPhoto(page, photo)
    await usePhotoInSeo(page, photo, 'Gaststube')

    await open(page, '/s/restaurant/files')
    await page.getByRole('button', { name: photo }).click()
    await details(page).getByRole('button', { name: 'Entfernen …' }).click()
    const dialog = page.getByRole('dialog', { name: 'Entfernen …' })
    await expect(dialog.getByText(`${photo} wird an 1 Stelle verwendet.`)).toBeVisible()
    await expect(dialog.getByRole('link', { name: 'Gasthaus zur Linde, Salzburg' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Entfernen', exact: true })).toHaveCount(0)
    await dialog.locator('[data-slot=dialog-footer]').getByRole('button', { name: 'Schließen' }).click()
    await expect(dialog).toHaveCount(0)
  })

  test('4. fixing a missing alt text lowers the count at once, without a reload', async ({ page, context }) => {
    const photo = `f6-ohne-alt-${stamp()}.png`
    // Wrong behaviour caught: the server rendered the phone layout of the library and a wide browser did not, so Vue
    // threw the server HTML of that part away on every load (a hydration mismatch).
    const mismatches: string[] = []
    page.on('console', (message) => { if (message.text().includes('Hydration')) mismatches.push(message.text()) })
    await open(page, '/s/restaurant/files')
    expect(mismatches).toEqual([])
    await uploadPhoto(page, photo)
    await usePhotoInSeo(page, photo, 'Gaststube')

    // The description is German only; the English version of the entry lacks it.
    await open(page, '/s/restaurant/files')
    await openView(page, 'Bildbeschreibung fehlt')
    const missing = page.getByText('Keine Bildbeschreibung', { exact: true })
    await expect(missing).toHaveCount(1)
    if (!narrow(page)) await expect(page.getByRole('navigation', { name: 'Dateien' }).getByRole('button', { name: /Bildbeschreibung fehlt/ })).toContainText('1')

    const editor = await context.newPage()
    await open(editor, '/s/restaurant/all/seo')
    await editor.getByRole('button', { name: 'Englisch' }).click()
    await editor.getByRole('textbox', { name: 'Bildbeschreibung' }).fill('Dining room')
    await editor.getByRole('button', { name: 'Speichern', exact: true }).click()
    await expect(toast(editor)).toContainText('Gespeichert')
    await editor.close()

    // The Finder in the first tab was not reloaded.
    await expect(missing).toHaveCount(0)
    await expect(page.getByText('Jedes Foto hat eine Beschreibung.')).toBeVisible()
    if (!narrow(page)) await expect(page.getByRole('navigation', { name: 'Dateien' }).getByRole('button', { name: /Bildbeschreibung fehlt/ })).not.toContainText('1')
  })

  // The text page this needs: a Markdown field with the `page` profile (the figure component). The restaurant site that
  // this suite pushes has only `basic` texts (no pictures, no components), so the test waits for such a field there.
  test.fixme('4b. picks a library image for a Markdown figure and the preview shows it', async ({ page }) => {
    const photo = `f6-figur-${stamp()}.png`
    await open(page, '/s/restaurant/files')
    await uploadPhoto(page, photo)

    await open(page, '/s/restaurant/all/pages/new')
    await page.getByLabel('Titel').fill(`Bildseite ${stamp()}`)
    const text = page.getByRole('textbox', { name: 'Text' })
    await text.click()
    await page.keyboard.type('/Abbildung')
    await page.keyboard.press('Enter')
    const settings = page.getByRole('dialog', { name: 'Abbildung' })
    await settings.getByRole('button', { name: 'Bild wählen' }).click()
    const picker = page.getByRole('dialog', { name: 'Dateien' })
    await picker.getByRole('button', { name: photo }).click()
    await picker.getByLabel('Bildbeschreibung').fill('Gedeckter Tisch im Garten')
    await picker.getByRole('button', { name: 'Dieses Foto verwenden' }).click()
    await expect(picker).toHaveCount(0)
    await expect(settings.locator('img')).toHaveAttribute('src', /\/api\/storage\//)
    await expect(settings.getByLabel('Bildbeschreibung')).toHaveValue('Gedeckter Tisch im Garten')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Speichern', exact: true }).click()
    await expect(toast(page)).toContainText('Gespeichert')
    await page.reload({ waitUntil: 'networkidle' })
    // The text keeps the library reference; the site gets the file's address.
    await page.getByRole('button', { name: 'Markdown-Quelltext zeigen' }).click()
    await expect(page.getByRole('textbox', { name: 'Text' })).toHaveValue(/src="\$file\.[A-Za-z0-9_-]+"/)
    await page.getByRole('button', { name: 'Vorschau', exact: true }).click()
    const preview = page.frameLocator('iframe[title="Vorschau der Website"]')
    await expect(preview.locator('figure img')).toHaveAttribute('src', /\/api\/storage\//, { timeout: 20_000 })
  })
})

// ---- Review, History, ⌘K, "Why not on the website?" ----

/** The words of the Studio that the tests read, in both languages (packages/ginko-studio/i18n, ginko-server/i18n, the gastro preset). */
const WORDS = {
  de: {
    locale: 'de-DE', lunchTask: 'Mittagsmenü dieser Woche', tuesday: 'Dienstag', dish: 'Gericht', rightAgain: 'Ja, stimmt', save: 'Speichern', sent: 'Zur Freigabe gesendet.',
    reviewLink: 'Prüfen (1 zu prüfen)', approve: 'Freigeben', approved: 'Freigegeben. Auf der Website in etwa einer Minute.', nothingWaits: 'Nichts wartet auf deine Entscheidung.',
    search: 'Suche und Aktionen', rowChanged: /Kürbisgulasch/, waiting: 'Wartet auf Freigabe', palettePlaceholder: 'Einträge und Bereiche suchen …',
    approvedByYou: 'Freigabe: Du',
  },
  en: {
    locale: 'en-US', lunchTask: 'This week’s lunch menu', tuesday: 'Tuesday', dish: 'Dish', rightAgain: 'Yes, correct', save: 'Save', sent: 'Sent for approval.',
    reviewLink: 'Review (1 to review)', approve: 'Approve', approved: 'Approved. On the website in about a minute.', nothingWaits: 'Nothing waits for your decision.',
    search: 'Search and actions', rowChanged: /Kürbisgulasch/, waiting: 'Waiting for approval', palettePlaceholder: 'Search entries and areas…',
    approvedByYou: 'Approval: You',
  },
}
type Lang = keyof typeof WORDS

/** A context for `who` with the viewport of the project and the browser language of `lang`. */
async function contextOf(browser: Browser, who: 'owner' | 'cook', lang: Lang, viewport: { width: number; height: number }, baseURL: string | undefined) {
  return browser.newContext({ baseURL, locale: WORDS[lang].locale, viewport, storageState: STATE[who] })
}

/** The cook changes Tuesday's dish in "This week's lunch menu" and saves; the task waits for an approval, so it is only proposed. */
async function cookProposes(page: Page, w: (typeof WORDS)[Lang], dish: string) {
  await open(page, '/s/restaurant')
  await page.getByRole('heading', { level: 2 }).first().waitFor()
  await page.getByRole('button', { name: w.lunchTask }).click()
  const sheet = page.getByRole('dialog')
  const tuesday = sheet.locator('li', { has: page.getByRole('heading', { name: w.tuesday }) })
  await tuesday.getByLabel(w.dish).fill(dish)
  await tuesday.getByRole('button', { name: w.rightAgain }).click()
  await sheet.getByRole('button', { name: w.save, exact: true }).click()
  await expect(toast(page)).toContainText(w.sent)
}

/** The owner's way into Review: the "To review (n)" link in the header. */
async function openReview(page: Page, w: (typeof WORDS)[Lang]) {
  await open(page, '/s/restaurant')
  // The review view in the rail (wide) or the tab bar (phone), with its count.
  await page.getByRole('link', { name: w.reviewLink }).click()
  await page.waitForURL(/\/s\/restaurant\/review$/)
}

/** The loose open proposals of the inbox (the labelled queue list, not the release members), one `li` each, oldest first. */
const proposalRows = (page: Page) => page.locator('main ul[aria-label] > li[data-proposal]')

/**
 * Opens the oldest proposal and returns where its diff and decisions are: on wide screens the oldest is selected by
 * itself and shown beside the list; on the phone its row expands in place.
 */
async function openOldest(page: Page) {
  const toggle = proposalRows(page).first().getByRole('button').first()
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
  return page.getByTestId('proposal-open').or(proposalRows(page).first().filter({ has: page.locator('button[aria-expanded="true"]') }))
}

/**
 * Rejects every open proposal. The content reset keeps proposals (the seed knows entries, changes and ops only), and the
 * proposals of earlier runs would count as "Zu prüfen". They are all stale after a reset, so Ablehnen… is all the page offers.
 */
async function emptyReview(browser: Browser, baseURL: string | undefined, viewport: { width: number; height: number }) {
  const owner = await contextOf(browser, 'owner', 'de', viewport, baseURL)
  const page = await owner.newPage()
  await open(page, '/s/restaurant/review')
  const rows = proposalRows(page)
  await expect(rows.or(page.getByText(WORDS.de.nothingWaits))).not.toHaveCount(0)
  for (let left = await rows.count(); left > 0; left = await rows.count()) {
    const row = await openOldest(page)
    await row.getByRole('button', { name: 'Ablehnen…' }).click()
    await row.getByRole('textbox').fill('Aufgeräumt vor dem Test.')
    await row.getByRole('button', { name: 'Ablehnen', exact: true }).click()
    await expect(rows).toHaveCount(left - 1)
  }
  await owner.close()
}


for (const lang of ['de', 'en'] as const) {
  const w = WORDS[lang]
  // German is the project's browser language; English is a second context, like language.spec.ts.
  const suffix = lang === 'de' ? '' : ' (English)'

  test.describe(`Prüfen, ⌘K, Warum nicht${suffix}`, () => {
    test(`5. the cook's save waits for approval; the owner sees "${w.reviewLink}", approves, and it is live${suffix}`, async ({ browser, baseURL, viewport }) => {
      const dish = `Kürbisgulasch ${stamp()}`
      await emptyReview(browser, baseURL, viewport!)
      // The cook stays in German: the account language of a member wins over the browser and would stay behind if a test stopped half-way.
      const cook = await contextOf(browser, 'cook', 'de', viewport!, baseURL)
      const cookPage = await cook.newPage()
      await cookProposes(cookPage, WORDS.de, dish)

      const owner = await contextOf(browser, 'owner', lang, viewport!, baseURL)
      const ownerPage = await owner.newPage()
      await openReview(ownerPage, w)
      const row = await openOldest(ownerPage)
      // The diff names what changed: the lunch days (one row) and the week.
      await expect(row.getByText(w.rowChanged)).toBeVisible()
      await row.getByRole('button', { name: w.approve, exact: true }).click()
      await expect(toast(ownerPage)).toContainText(w.approved)
      await expect(ownerPage.getByText(w.nothingWaits)).toBeVisible()
      // The review link no longer counts anything waiting (its name is "Prüfen (1 zu prüfen)" while one waits).
      await expect(ownerPage.getByRole('link', { name: /(zu prüfen|to review)\)$/ })).toHaveCount(0)

      // Live: the lunch task shows the dish now. From Saturday "this week" is the next work week, and the task edits the
      // week planned ahead (lunchPlans) instead of the lunch entry, so the dish is read back through the same task.
      await open(ownerPage, '/s/restaurant')
      await ownerPage.getByRole('heading', { level: 2 }).first().waitFor()
      await ownerPage.getByRole('button', { name: w.lunchTask }).click()
      await expect(ownerPage.getByRole('dialog').locator('li', { has: ownerPage.getByRole('heading', { name: w.tuesday }) }).getByLabel(w.dish)).toHaveValue(dish)
      // The owner's History names who made the change (an owner sees the cook's address) and the owner as the approver.
      await open(ownerPage, '/s/restaurant/history')
      await expect(ownerPage.locator('main ol li').first()).toContainText('koch@example.test')
      await expect(ownerPage.locator('main ol li').first()).toContainText(w.approvedByYou)
      await owner.close()

      // The cook's History: nothing waits any more, and the change is there as done, as their own ("Du", ce0c081d).
      await open(cookPage, '/s/restaurant/history')
      await expect(cookPage.getByRole('heading', { name: WORDS.de.waiting })).toHaveCount(0)
      await expect(cookPage.locator('main ol li').first()).toContainText('Du · Freigabe: Ein Mitglied')
      await cook.close()
    })

    test(`8. ⌘K "schni" and Enter open the Schnitzel entry${suffix}`, async ({ browser, baseURL, viewport }) => {
      const owner = await contextOf(browser, 'owner', lang, viewport!, baseURL)
      const page = await owner.newPage()
      await open(page, '/s/restaurant')
      await page.keyboard.press('ControlOrMeta+k')
      const palette = page.getByRole('dialog', { name: w.search })
      await expect(palette).toBeVisible()
      await palette.getByPlaceholder(w.palettePlaceholder).fill('schni')
      await expect(palette.getByRole('option', { name: /Wiener Schnitzel vom Kalb/ })).toBeVisible()
      await page.keyboard.press('Enter')
      await page.waitForURL(/\/s\/restaurant\/all\/menu\/\w+$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Wiener Schnitzel vom Kalb' })).toBeVisible()
      await owner.close()
    })
  })
}

test.describe('Prüfen und Verlauf', () => {
  test('6. the owner rejects with a sentence; the cook sees the sentence in History', async ({ browser, baseURL, viewport }) => {
    const w = WORDS.de
    const sentence = `Das Gulasch ist schon vom Plan ${stamp()}.`
    await emptyReview(browser, baseURL, viewport!)
    const cook = await contextOf(browser, 'cook', 'de', viewport!, baseURL)
    const cookPage = await cook.newPage()
    await cookProposes(cookPage, w, 'Kürbisgulasch zum Ablehnen')

    const owner = await contextOf(browser, 'owner', 'de', viewport!, baseURL)
    const ownerPage = await owner.newPage()
    await openReview(ownerPage, w)
    const row = await openOldest(ownerPage)
    await row.getByRole('button', { name: 'Ablehnen…' }).click()
    await row.getByLabel('Warum? Das sieht, wer die Änderung vorgeschlagen hat.').fill(sentence)
    await row.getByRole('button', { name: 'Ablehnen', exact: true }).click()
    await expect(toast(ownerPage)).toContainText('Abgelehnt.')
    await expect(ownerPage.getByText(w.nothingWaits)).toBeVisible()
    await owner.close()

    await open(cookPage, '/s/restaurant/history')
    await expect(cookPage.getByRole('heading', { name: w.waiting })).toHaveCount(0)
    await expect(cookPage.getByText(sentence)).toBeVisible({ timeout: 5000 })
    await cook.close()
  })

  test.describe('7. History detail', () => {
    test.use({ storageState: STATE.owner })

    test('a reader in another time zone is told that the times are the site’s', async ({ browser, baseURL, viewport }) => {
      const away = await browser.newContext({ baseURL, viewport, storageState: STATE.owner, timezoneId: 'America/Los_Angeles' })
      const page = await away.newPage()
      await open(page, '/s/restaurant/history')
      await expect(page.getByText('Alle Zeiten in der Zeitzone der Website (Europe/Vienna).')).toBeVisible()
      await away.close()
    })

    test('Show changes shows before and after; Back to this version is a new save; Undo takes it back', async ({ page }) => {
      const priceField = () => page.getByRole('textbox', { name: 'Preis', exact: true })
      const setPrice = async (value: string) => {
        await open(page, '/s/restaurant/all/menu')
        await page.getByRole('link', { name: 'Wiener Schnitzel vom Kalb' }).click()
        await priceField().fill(value)
        await page.getByRole('button', { name: 'Speichern', exact: true }).click()
        await expect(toast(page)).toContainText('Gespeichert')
      }
      await setPrice('23,50')
      await setPrice('25,00')

      await open(page, '/s/restaurant/history')
      const rows = page.locator('main ol > li')
      // "Zurück zu dieser Version" is a button in the row when the undo is blocked, else it is in the row's menu; the question then opens in the row.
      const askRevert = async (row: typeof rows) => {
        const button = row.getByRole('button', { name: 'Zurück zu dieser Version' })
        if (await button.isVisible()) return button.click()
        await row.getByRole('button', { name: 'Weitere Aktionen' }).click()
        await page.getByRole('menuitem', { name: 'Zurück zu dieser Version' }).click()
      }
      // Newest first: the 25,00 save, then the 23,50 save. The fields show in the row, or in the right column on wide screens.
      await rows.nth(1).getByRole('button', { name: 'Änderungen anzeigen' }).click()
      const detail = page.getByRole('region', { name: 'Änderungen', exact: true })
      await expect(detail).toContainText('Vorher')
      await expect(detail).toContainText('21,90')
      await expect(detail).toContainText('Nachher')
      await expect(detail).toContainText('23,50')

      const before = await rows.count()
      await askRevert(rows.nth(1))
      await expect(rows.nth(1).getByText(/^Zum Stand direkt nach dieser Änderung \(.*\) zurück\?/)).toBeVisible()
      // The question shows what going back changes: now (25,00) before, that version (23,50) after.
      await expect(rows.nth(1).getByRole('group')).toContainText('Das ändert sich:')
      await expect(rows.nth(1).getByRole('group')).toContainText('25,00')
      await rows.nth(1).getByRole('group').getByRole('button', { name: 'Zurück zu dieser Version' }).click()
      await expect(rows).toHaveCount(before + 1)

      // A new save at the top, and the price is the old one.
      await open(page, '/s/restaurant/all/menu')
      await page.getByRole('link', { name: 'Wiener Schnitzel vom Kalb' }).click()
      await expect(priceField()).toHaveValue('23,50')

      await open(page, '/s/restaurant/history')
      await rows.first().getByRole('button', { name: 'Rückgängig' }).click()
      // Undo is a save of its own at the top; the row it undid is marked.
      await expect(rows.first()).toContainText('Rückgängig: ')
      await expect(rows.nth(1)).toContainText('Rückgängig gemacht')
      // The undo row holds the current state too: going back to it has nothing to change.
      await askRevert(rows.first())
      await expect(rows.first().getByRole('group')).toContainText('Das ist schon der aktuelle Stand.')
      await expect(rows.first().getByRole('group').getByRole('button', { name: 'Zurück zu dieser Version' })).toHaveCount(0)
      await rows.first().getByRole('group').getByRole('button', { name: 'Abbrechen' }).click()

      // After a later save the undo row is a step back (R6): going back to it shows what changes and saves it.
      await setPrice('26,00')
      await open(page, '/s/restaurant/history')
      const undoRow = rows.nth(1)
      await expect(undoRow).toContainText('Rückgängig: ')
      await askRevert(undoRow)
      await expect(undoRow.getByRole('group')).toContainText('Das ändert sich:')
      await expect(undoRow.getByRole('group')).toContainText('26,00')
      await expect(undoRow.getByRole('group')).toContainText('25,00')
      const count = await rows.count()
      await undoRow.getByRole('group').getByRole('button', { name: 'Zurück zu dieser Version' }).click()
      await expect(rows).toHaveCount(count + 1)
      await open(page, '/s/restaurant/all/menu')
      await page.getByRole('link', { name: 'Wiener Schnitzel vom Kalb' }).click()
      await expect(priceField()).toHaveValue('25,00')
    })
  })
})
