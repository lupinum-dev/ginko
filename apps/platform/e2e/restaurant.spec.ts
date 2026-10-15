// The restaurant jobs of UI.md 9, as the owner (Wirtin) and the cook (Koch) do them, at 390 and 1440 px.
import { addDays, DEFAULT_WEEK, todayIn, workWeekOf } from '@lupinum/ginko/internal'
import { expect, test, type Page } from '@playwright/test'
import { STATE } from './global-setup'
import { codeFor, openQuick, resetContent, serverDir } from './local'

const today = () => todayIn('Europe/Vienna')
const asOwner = { storageState: STATE.owner }
const asCook = { storageState: STATE.cook }

test.beforeEach(() => resetContent())

const notice = (page: Page, text: string) => page.locator('section', { has: page.getByRole('heading', { name: 'Hinweise' }) }).getByText(text, { exact: true })
const toast = (page: Page) => page.locator('[data-sonner-toast]').filter({ hasText: /Gespeichert|Entfernt|Rückgängig/ })

test.describe('Wirtin', () => {
  test.use(asOwner)

  test('1. "Heute ausgebucht" takes two taps, shows in the list, and Rückgängig takes it back', async ({ page }) => {
    await openQuick(page)
    const before = await notice(page, 'Heute sind wir ausgebucht.').count()
    await page.getByRole('button', { name: 'Heute ausgebucht' }).click()
    await page.getByRole('button', { name: 'Speichern' }).click()
    await expect(toast(page)).toContainText('Gespeichert. Auf der Website in etwa einer Minute.')
    await expect(notice(page, 'Heute sind wir ausgebucht.')).toHaveCount(before + 1)
    await toast(page).getByRole('button', { name: 'Rückgängig' }).click()
    await expect(notice(page, 'Heute sind wir ausgebucht.')).toHaveCount(before)
  })

  test('2. "Heute geschlossen" with a reason shows the state, and Aufheben ends it', async ({ page }) => {
    await openQuick(page)
    await page.getByRole('button', { name: 'Heute geschlossen' }).click()
    await expect(page.getByLabel('Heute geschlossen am')).toHaveValue(today())
    await page.getByLabel('Hinweis zur Schließung').fill('Geschlossene Gesellschaft')
    await page.getByRole('button', { name: 'Speichern' }).click()
    await expect(page.getByText('ist für heute eingetragen.')).toBeVisible()
    await expect(page.getByText('„Geschlossene Gesellschaft“')).toBeVisible()
    await page.getByRole('button', { name: 'Aufheben' }).click()
    await expect(page.getByText('ist für heute eingetragen.')).toHaveCount(0)
  })

  test('3. the weekly lunch starts this Monday from last week, and a new dish asks for its allergens', async ({ page }) => {
    await openQuick(page)
    await page.getByRole('button', { name: 'Mittagsmenü dieser Woche' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByLabel('Woche ab')).toHaveValue(workWeekOf(today(), DEFAULT_WEEK))
    const tuesday = sheet.locator('li', { has: page.getByRole('heading', { name: 'Dienstag' }) })
    await tuesday.getByLabel('Gericht').fill('Rindsgulasch mit Semmelknödel')
    await expect(tuesday.getByText('Sind die Allergene noch richtig?')).toBeVisible()
    await sheet.getByRole('button', { name: 'Speichern' }).click()
    await expect(sheet.getByText(/Bitte bestätige bei „Dienstag“/)).toBeVisible()
    await tuesday.getByRole('button', { name: 'Ja, stimmt' }).click()
    await sheet.getByRole('button', { name: 'Speichern' }).click()
    await expect(toast(page)).toContainText('Gespeichert')
    await expect(page.getByText(/noch nicht für diese Woche/)).toHaveCount(0)
  })

  test('6. a new dish needs its allergens; "Keine" is a valid answer', async ({ page }) => {
    await openQuick(page)
    await page.getByRole('button', { name: 'Gericht hinzufügen' }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('radio', { name: 'Hauptspeisen' }).check()
    await sheet.getByLabel('Name').fill('Ofengemüse')
    await sheet.getByLabel('Preis', { exact: true }).fill('13,50')
    await sheet.getByRole('radio', { name: 'vegan' }).check()
    await sheet.getByRole('button', { name: 'Speichern' }).click()
    await expect(sheet.getByText('„Allergene“ fehlt.')).toBeVisible()
    await sheet.getByRole('checkbox', { name: 'Keine', exact: true }).click()
    await sheet.getByRole('button', { name: 'Speichern' }).click()
    await expect(toast(page)).toContainText('Gespeichert')
  })

  test('7. a double tap on Speichern creates one notice', async ({ page }) => {
    await openQuick(page)
    const before = await notice(page, 'Heute sind wir ausgebucht.').count()
    await page.getByRole('button', { name: 'Heute ausgebucht' }).click()
    await page.getByRole('button', { name: 'Speichern' }).dblclick()
    await expect(toast(page)).toContainText('Gespeichert')
    await page.waitForTimeout(1000)
    await expect(notice(page, 'Heute sind wir ausgebucht.')).toHaveCount(before + 1)
  })

  test('10. Alles bearbeiten: a new event; the preview shows its unsaved title', async ({ page }) => {
    await page.goto('/s/restaurant/all/events/new', { waitUntil: 'networkidle' })
    await page.getByLabel('Titel').fill('Kürbisabend für Freunde')
    await page.getByLabel('von').fill(addDays(today(), 10))
    await page.getByRole('button', { name: 'Vorschau', exact: true }).click()
    const preview = page.frameLocator('iframe[title="Vorschau der Website"]')
    await expect(preview.getByText('Kürbisabend für Freunde').first()).toBeVisible({ timeout: 20_000 })
  })

  test('25. the size line of the save bar is a live region before it says anything', async ({ page }) => {
    await page.goto('/s/restaurant/all/events/new', { waitUntil: 'networkidle' })
    // Screen readers announce only changes inside a live region that is already in the accessibility tree.
    const sizeLine = page.locator('.bar [aria-live="polite"]')
    await expect(sizeLine).toHaveText('')
    await expect(sizeLine).not.toHaveCSS('display', 'none')
  })

  test('13. she changes the phone number herself; a number with letters is refused', async ({ page }) => {
    await page.goto('/s/restaurant/all', { waitUntil: 'networkidle' })
    await page.getByRole('link', { name: 'Adresse und Kontakt' }).first().click()
    const phone = page.getByLabel('Telefon')
    await phone.fill('0662 abc')
    await page.getByRole('button', { name: 'Speichern', exact: true }).click()
    await expect(page.getByText('„Telefon“ hat kein gültiges Format.')).toBeVisible()
    await phone.fill('+43 662 123 456')
    await page.getByRole('button', { name: 'Vorschau', exact: true }).click()
    const preview = page.frameLocator('iframe[title="Vorschau der Website"]')
    await expect(preview.locator('footer a[href="tel:+43662123456"]')).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Speichern', exact: true }).click()
    await expect(toast(page)).toContainText('Gespeichert')
  })
})

test.describe('Unterwegs (break-it 9)', () => {
  test.use(asOwner)

  test('14. the back button with typed input in a sheet asks first and keeps the input', async ({ page }) => {
    // Arrive by a click inside the app (not a fresh load), so Back is an in-app navigation.
    await page.goto('/s/restaurant/history', { waitUntil: 'networkidle' })
    // The views are in the rail (wide) or the tab bar (phone); only one of them is visible.
    await page.getByRole('navigation', { name: 'Ansichten' }).getByRole('link', { name: 'Heute' }).click()
    await page.getByRole('button', { name: 'Hinweis hinzufügen' }).click()
    await page.getByRole('dialog').getByLabel('Text').fill('Küche ab 18 Uhr')
    const asked = page.waitForEvent('dialog').then(async (d) => { await d.dismiss(); return d.message() })
    // The guard cancels the navigation, so goBack never settles on a load: do not wait for it.
    void page.goBack().catch(() => undefined)
    expect(await asked).toContain('noch nicht gespeichert')
    await expect(page.getByRole('dialog').getByLabel('Text')).toHaveValue('Küche ab 18 Uhr')
  })

  test('15. closing a sheet while the save waits for the connection says the save goes on', async ({ page, context }) => {
    await openQuick(page)
    await page.getByRole('button', { name: 'Hinweis hinzufügen' }).click()
    await page.getByRole('dialog').getByLabel('Text').fill('Offline gespeichert')
    await context.setOffline(true)
    await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Abbrechen' }).click()
    await expect(page.getByText('Speichern läuft weiter.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Verwerfen' })).toHaveCount(0)
    await context.setOffline(false)
    await expect(notice(page, 'Offline gespeichert')).toHaveCount(1, { timeout: 30_000 })
  })

  test('16. a negative price is named as such and blocks saving', async ({ page }) => {
    await page.goto('/s/restaurant/all/menu', { waitUntil: 'networkidle' })
    await page.getByRole('link', { name: /Wiener Schnitzel/ }).first().click()
    await page.getByLabel('Preis', { exact: true }).fill('-1')
    await expect(page.getByText('Ein Preis kann nicht negativ sein.')).toBeVisible()
    await page.getByRole('button', { name: 'Speichern', exact: true }).click()
    await expect(page.getByText('„Preis“ fehlt.')).toHaveCount(0)
  })

  // Wrong behaviour caught: on a phone the buttons squeeze a removed entry's title to a few letters, so nobody can tell
  // which entry "Jetzt löschen" deletes for good.
  test('25. on a phone a removed entry keeps its title on the full width, with the buttons below', async ({ page }) => {
    test.skip(page.viewportSize()!.width >= 640, 'The row stays on one line from 640 px.')
    await page.goto('/s/restaurant/all/menu', { waitUntil: 'networkidle' })
    await page.getByRole('link', { name: 'Wiener Schnitzel vom Kalb' }).click()
    await page.getByRole('button', { name: 'Mehr' }).click()
    await page.getByRole('menuitem', { name: 'Eintrag entfernen' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Entfernen' }).click()
    await expect(page.locator('[data-sonner-toast]')).toContainText('entfernt')

    await page.goto('/s/restaurant/all?removed', { waitUntil: 'networkidle' })
    const row = page.getByRole('listitem').filter({ hasText: 'Wiener Schnitzel vom Kalb' })
    const title = row.getByText('Wiener Schnitzel vom Kalb', { exact: true })
    await expect(title).toBeVisible()
    const [rowBox, titleBox, buttonBox] = await Promise.all([row.boundingBox(), title.boundingBox(), row.getByRole('button', { name: 'Wiederherstellen' }).boundingBox()])
    // The title gets the row's width (less its padding), and the buttons start below the title and the date line.
    expect(titleBox!.width).toBeGreaterThan(rowBox!.width - 40)
    expect(buttonBox!.y).toBeGreaterThan(titleBox!.y + titleBox!.height)
    expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  })

  test('23. after a reload the typed name comes back with "Wiederherstellen"', async ({ page }) => {
    await page.goto('/s/restaurant/all/menu', { waitUntil: 'networkidle' })
    await page.getByRole('link', { name: 'Wiener Schnitzel vom Kalb' }).click()
    await page.getByRole('textbox', { name: 'Name' }).fill('Schnitzel mit Preiselbeeren')
    // The local copy is written after a short pause in typing.
    await page.waitForTimeout(1000)
    // The browser's own leave question: leaving there keeps the local copy.
    page.once('dialog', (d) => d.accept())
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Wiener Schnitzel vom Kalb')
    await page.getByRole('button', { name: 'Wiederherstellen', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Schnitzel mit Preiselbeeren')
  })
})

test.describe('Übersetzen (Phase 11)', () => {
  test.use(asOwner)

  test('17. a changed German dish asks to check its English translation, and "Passt so" confirms it', async ({ page }) => {
    await page.goto('/s/restaurant/all/lunch', { waitUntil: 'networkidle' })
    const monday = page.locator('li', { has: page.getByRole('heading', { name: 'Montag' }) })
    await monday.getByLabel('Gericht').fill('Kürbiscremesuppe mit Kernöl und Croutons')
    await monday.getByRole('button', { name: 'Ja, stimmt' }).click()
    await page.getByRole('button', { name: 'Speichern', exact: true }).click()
    await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Englisch' }).click()
    await expect(monday.getByText('Deutsch geändert seit Übersetzung')).toBeVisible()
    await expect(monday.getByText('Kürbiscremesuppe mit Kernöl und Croutons')).toBeVisible()
    await monday.getByRole('button', { name: 'Passt so' }).click()
    await page.getByRole('button', { name: 'Speichern', exact: true }).click()
    await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible()
    await expect(monday.getByText('Deutsch geändert seit Übersetzung')).toHaveCount(0)
  })
})

test.describe('Übersetzen in Listen (Astra 11)', () => {
  test.use(asOwner)

  test('18. a confirmed translation in a removed list row does not block saving the rest', async ({ page }) => {
    await page.goto('/s/restaurant/all/hours', { waitUntil: 'networkidle' })
    const first = page.getByRole('group', { name: 'Betriebsurlaub und Ausnahmen' }).locator('[data-row]').first()
    const save = async () => {
      await page.getByRole('button', { name: 'Speichern', exact: true }).click()
      await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible()
    }
    // An English reason, then a German change: the English one is outdated.
    await page.getByRole('button', { name: 'Englisch' }).click()
    await first.getByLabel('Grund').fill('Winter holidays')
    await save()
    await page.getByRole('button', { name: 'Deutsch' }).click()
    await first.getByLabel('Grund').fill('Betriebsurlaub im Winter')
    await save()
    await page.getByRole('button', { name: 'Englisch' }).click()
    await first.getByRole('button', { name: 'Passt so' }).click()
    await first.getByRole('button', { name: /entfernen$/ }).click()
    await save()
  })
})

test.describe('Koch', () => {
  test.use(asCook)

  test('5. sees only his tasks: no "Heute geschlossen", no Team', async ({ page }) => {
    await openQuick(page)
    await expect(page.getByRole('button', { name: 'Preis ändern' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Heute geschlossen' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Team' })).toHaveCount(0)
  })

  test('4. changes a price found by search; a parallel change by the Wirtin shows as a conflict', async ({ page, browser }) => {
    await openQuick(page)
    await page.getByRole('button', { name: 'Preis ändern' }).click()
    await page.getByRole('searchbox').fill('schnitz')
    await page.getByRole('button', { name: 'Wiener Schnitzel vom Kalb' }).click()
    const price = page.getByRole('dialog').getByRole('textbox', { name: 'Preis', exact: true })
    await expect(price).toHaveValue('21,90')
    // Typed key by key, as on a phone: a comma must not wipe the field (walkthrough Koch).
    await price.fill('')
    await price.pressSequentially('22,50')
    await expect(price).toHaveValue('22,50')

    // Meanwhile the Wirtin changes the same price on her phone.
    const owner = await browser.newPage({ storageState: STATE.owner, viewport: { width: 390, height: 844 } })
    await openQuick(owner)
    await owner.getByRole('button', { name: 'Preis ändern' }).click()
    await owner.getByRole('searchbox').fill('schnitz')
    await owner.getByRole('button', { name: 'Wiener Schnitzel vom Kalb' }).click()
    await owner.getByRole('dialog').getByRole('textbox', { name: 'Preis', exact: true }).fill('23')
    await owner.getByRole('button', { name: 'Speichern' }).click()
    await expect(toast(owner)).toContainText('Gespeichert')
    await owner.close()

    // His typed price stays; saving now shows both values.
    await expect(price).toHaveValue('22,50')
    await page.getByRole('button', { name: 'Speichern' }).click()
    const conflict = page.getByRole('dialog').getByRole('alert')
    // The cook sees the owner as "Ein Mitglied", the way History names her for staff.
    await expect(conflict).toContainText('Ein Mitglied hat inzwischen Preis geändert.')
    await expect(conflict).toContainText('23,00')
    await expect(conflict).toContainText('22,50')
    await conflict.getByRole('button', { name: 'Meine Eingaben speichern' }).click()
    await expect(toast(page)).toContainText('Gespeichert')
  })
})

test.describe('Gleichzeitig (Astra phase 8)', () => {
  test.use(asOwner)

  test('11. an open form shows what someone else saved meanwhile, in fields not yet touched', async ({ page, browser }) => {
    await page.goto('/s/restaurant/all/menu', { waitUntil: 'networkidle' })
    await page.getByRole('link', { name: 'Wiener Schnitzel vom Kalb' }).click()
    const price = page.getByRole('textbox', { name: 'Preis', exact: true })
    await expect(price).toHaveValue('21,90')

    const cook = await browser.newPage({ storageState: STATE.cook, viewport: { width: 390, height: 844 } })
    await openQuick(cook)
    await cook.getByRole('button', { name: 'Preis ändern' }).click()
    await cook.getByRole('searchbox').fill('schnitz')
    await cook.getByRole('button', { name: 'Wiener Schnitzel vom Kalb' }).click()
    await cook.getByRole('dialog').getByRole('textbox', { name: 'Preis', exact: true }).fill('24')
    await cook.getByRole('button', { name: 'Speichern' }).click()
    await expect(toast(cook)).toContainText('Gespeichert')
    await cook.close()

    await expect(price).toHaveValue('24,00')
  })

  test('12. "Meine Eingaben speichern" sends only her change and keeps what the other saved', async ({ page, browser }) => {
    await page.goto('/s/restaurant/all/menu', { waitUntil: 'networkidle' })
    await page.getByRole('link', { name: 'Wiener Schnitzel vom Kalb' }).click()
    const name = page.getByRole('textbox', { name: 'Name' })
    await name.fill('Wiener Schnitzel vom Kalb, klassisch')

    // The cook changes the same name and the description at once.
    const cook = await browser.newPage({ storageState: STATE.cook, viewport: { width: 1440, height: 900 } })
    await cook.goto('/s/restaurant/all/menu', { waitUntil: 'networkidle' })
    await cook.getByRole('link', { name: 'Wiener Schnitzel vom Kalb' }).click()
    await cook.getByRole('textbox', { name: 'Name' }).fill('Kalbsschnitzel')
    await cook.getByRole('textbox', { name: 'Beschreibung' }).fill('Mit Petersilienerdäpfeln')
    await cook.getByRole('button', { name: 'Speichern' }).click()
    await expect(toast(cook)).toContainText('Gespeichert')
    await cook.close()

    await page.getByRole('button', { name: 'Speichern' }).click()
    await page.getByRole('button', { name: 'Meine Eingaben speichern' }).click()
    await expect(toast(page)).toContainText('Gespeichert')
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Wiener Schnitzel vom Kalb, klassisch')
    await expect(page.getByRole('textbox', { name: 'Beschreibung' })).toHaveValue('Mit Petersilienerdäpfeln')
  })

  test('21. "Neuen Stand übernehmen" takes the other value only for the conflicting field and keeps her other input', async ({ page, browser }) => {
    await page.goto('/s/restaurant/all/menu', { waitUntil: 'networkidle' })
    await page.getByRole('link', { name: 'Wiener Schnitzel vom Kalb' }).click()
    await page.getByRole('textbox', { name: 'Name' }).fill('Schnitzel der Wirtin')
    await page.getByRole('textbox', { name: 'Beschreibung' }).fill('Mit Erdäpfelsalat')

    const cook = await browser.newPage({ storageState: STATE.cook, viewport: { width: 1440, height: 900 } })
    await cook.goto('/s/restaurant/all/menu', { waitUntil: 'networkidle' })
    await cook.getByRole('link', { name: 'Wiener Schnitzel vom Kalb' }).click()
    await cook.getByRole('textbox', { name: 'Name' }).fill('Schnitzel des Kochs')
    await cook.getByRole('button', { name: 'Speichern' }).click()
    await expect(toast(cook)).toContainText('Gespeichert')
    await cook.close()

    await page.getByRole('button', { name: 'Speichern' }).click()
    await page.getByRole('button', { name: 'Neuen Stand übernehmen' }).click()
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Schnitzel des Kochs')
    await expect(page.getByRole('textbox', { name: 'Beschreibung' })).toHaveValue('Mit Erdäpfelsalat')
  })

  test('22. someone removes the entry she is editing; her input stays and "Wiederherstellen und speichern" saves it', async ({ page, browser }) => {
    await page.goto('/s/restaurant/all/menu', { waitUntil: 'networkidle' })
    await page.getByRole('link', { name: 'Wiener Schnitzel vom Kalb' }).click()
    const description = page.getByRole('textbox', { name: 'Beschreibung' })
    await description.fill('Mit Erdäpfelsalat')

    const other = await browser.newPage({ storageState: STATE.owner, viewport: { width: 1440, height: 900 } })
    await other.goto('/s/restaurant/all/menu', { waitUntil: 'networkidle' })
    await other.getByRole('link', { name: 'Wiener Schnitzel vom Kalb' }).click()
    await other.getByRole('button', { name: 'Mehr' }).click()
    await other.getByRole('menuitem', { name: 'Eintrag entfernen' }).click()
    await other.getByRole('dialog').getByRole('button', { name: 'Entfernen' }).click()
    await expect(other.locator('[data-sonner-toast]')).toContainText('entfernt')
    await other.close()

    await expect(page.getByRole('alert').filter({ hasText: 'Jemand hat diesen Eintrag entfernt.' })).toContainText('Jemand hat diesen Eintrag entfernt. Deine Änderungen sind noch da.')
    await expect(description).toHaveValue('Mit Erdäpfelsalat')
    await page.getByRole('button', { name: 'Wiederherstellen und speichern' }).click()
    await expect(toast(page)).toContainText('Gespeichert')
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('textbox', { name: 'Beschreibung' })).toHaveValue('Mit Erdäpfelsalat')
  })

  test('24. both add a row to the same list; the conflict names both rows and "Beides behalten" saves both', async ({ page, browser }) => {
    const exceptions = (p: Page) => p.getByRole('group', { name: 'Betriebsurlaub und Ausnahmen' })
    const addException = async (p: Page, reason: string, from: string) => {
      await exceptions(p).getByRole('button', { name: 'Ausnahme hinzufügen' }).click()
      const row = exceptions(p).locator('[data-row]').last()
      await row.getByLabel('von', { exact: true }).fill(from)
      await row.getByLabel('Grund').fill(reason)
    }
    await page.goto('/s/restaurant/all/hours', { waitUntil: 'networkidle' })
    await addException(page, 'Kaspressknödel-Fest', addDays(today(), 30))

    const other = await browser.newPage({ storageState: STATE.owner, viewport: { width: 1440, height: 900 } })
    await other.goto('/s/restaurant/all/hours', { waitUntil: 'networkidle' })
    await addException(other, 'Frittatensuppen-Tag', addDays(today(), 40))
    await other.getByRole('button', { name: 'Speichern', exact: true }).click()
    await expect(toast(other)).toContainText('Gespeichert')
    await other.close()

    await page.getByRole('button', { name: 'Speichern', exact: true }).click()
    const panel = page.getByRole('alert').filter({ hasText: /inzwischen/i })
    await expect(panel).toContainText('Du hast „Kaspressknödel-Fest“ hinzugefügt')
    await expect(panel).toContainText('„Frittatensuppen-Tag“ hinzugefügt')
    await page.getByRole('button', { name: 'Beides behalten' }).click()
    await expect(toast(page)).toContainText('Gespeichert')
    await page.reload({ waitUntil: 'networkidle' })
    const reasons = exceptions(page).getByLabel('Grund')
    await expect(reasons.nth(-2)).toHaveValue('Frittatensuppen-Tag')
    await expect(reasons.last()).toHaveValue('Kaspressknödel-Fest')
  })
})

test.describe('Anmelden und Einladung', () => {
  // Better Auth limits code mails per minute; sign-in looks the same at both widths, so it runs once.
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 500, 'sign-in runs at phone width only')

  // Every Studio page is protected by default (convex.auth.routes 'protected'); only /login opts out.
  test('an anonymous visitor of a Studio page is sent to the sign-in, with the way back', async ({ page }) => {
    for (const path of ['/', '/s/restaurant/team', '/invite/any-token']) {
      await page.goto(path, { waitUntil: 'networkidle' })
      await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('redirect') === path)
    }
  })

  test('8. a wrong code is refused with a clear message', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' })
    await page.getByLabel('E-Mail-Adresse').fill('wirtin@example.test')
    await page.getByRole('button', { name: 'Code senden' }).click()
    await page.getByLabel('Code').waitFor()
    const real = codeFor('wirtin@example.test')
    await page.getByLabel('Code').fill(real === '000000' ? '111111' : '000000')
    await page.getByRole('button', { name: 'Anmelden' }).click()
    await expect(page.getByText('Der Code stimmt nicht oder ist abgelaufen.')).toBeVisible()
  })

  test('9. a new staff member accepts the invite and lands on their tasks', async ({ page, browser }, info) => {
    const email = `neu-${info.project.name}-${Date.now()}@example.test`
    const owner = await browser.newPage({ storageState: STATE.owner })
    await owner.goto('/s/restaurant/team', { waitUntil: 'networkidle' })
    await owner.getByRole('button', { name: 'Einladen' }).click()
    await owner.getByLabel('E-Mail-Adresse').fill(email)
    await owner.getByRole('checkbox', { name: 'Mittagsmenü dieser Woche' }).check()
    await owner.getByRole('button', { name: 'Einladung senden' }).click()
    await expect(owner.getByText(email).first()).toBeVisible()
    await owner.close()

    const { execFileSync } = await import('node:child_process')
    const mails = execFileSync('npx', ['convex', 'data', 'outbox', '--limit', '30', '--order', 'desc', '--format', 'jsonLines'], { cwd: serverDir, encoding: 'utf8' })
    const link = mails.trim().split('\n').map((l) => JSON.parse(l) as { to: string; text: string }).find((m) => m.to === email)!.text.match(/(http\S+\/invite\/\S+)/)![1]!

    await page.goto('/login', { waitUntil: 'networkidle' })
    await page.getByLabel('E-Mail-Adresse').fill(email)
    await page.getByRole('button', { name: 'Code senden' }).click()
    await page.getByLabel('Code').waitFor()
    await page.getByLabel('Code').fill(codeFor(email))
    await page.getByRole('button', { name: 'Anmelden' }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/login'))
    await page.goto(link, { waitUntil: 'networkidle' })
    await expect(page.getByText('Gasthaus zur Linde lädt dich als Mitarbeiter ein.')).toBeVisible()
    await page.getByRole('button', { name: 'Einladung annehmen' }).click()
    await page.waitForURL(/\/s\/restaurant$/)
    await expect(page.getByRole('button', { name: 'Mittagsmenü dieser Woche' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Preis ändern' })).toHaveCount(0)
  })
})
