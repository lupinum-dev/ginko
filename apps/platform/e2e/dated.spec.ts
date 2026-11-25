// A price for a later day (a dated change, D125-D131) as the owner sets it in "Preis ändern", at 390 and 1440 px.
// Half-typed dates and the other dangers of the day field are covered by the component tests (task-sheet.test.ts).
import { addDays, todayIn } from '@lupinum/ginko/internal'
import { expect, test, type Page } from '@playwright/test'
import { STATE } from './global-setup'
import { onlinePrice, openQuick, resetContent } from './local'

const DISH = 'Kürbisrisotto'
const today = () => todayIn('Europe/Vienna')
/** The day as the Studio words it: short in the button, long in the message and the notice. */
const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('de', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('de', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

test.use({ storageState: STATE.owner })
test.beforeEach(() => resetContent())

const toast = (page: Page) => page.locator('[data-sonner-toast]').filter({ hasText: /Gespeichert|Veröffentlicht|aufgehoben/ })

/** Opens "Preis ändern" for the dish and returns the sheet. */
async function openPrice(page: Page) {
  await openQuick(page)
  await page.getByRole('button', { name: 'Preis ändern' }).click()
  await page.getByRole('searchbox').fill('risotto')
  await page.getByRole('button', { name: DISH }).click()
  return page.getByRole('dialog')
}

/** Sets a price for tomorrow in "Preis ändern" and presses the primary button; the sheet closes after the save. */
async function planForTomorrow(page: Page, price: string) {
  const sheet = await openPrice(page)
  await sheet.getByRole('textbox', { name: 'Preis', exact: true }).fill(price)
  await sheet.getByRole('button', { name: 'Morgen' }).click()
  await sheet.getByRole('button', { name: `Ab ${shortDay(addDays(today(), 1))} veröffentlichen` }).click()
  await expect(sheet).toHaveCount(0)
}

// Wrong behaviour caught: a price for tomorrow went online at once, or was saved without saying for which day.
test('a price for tomorrow waits for its day: the button and the message name the day, and the task shows the change', async ({ page }) => {
  const tomorrow = addDays(today(), 1)
  const before = onlinePrice(DISH)
  const sheet = await openPrice(page)
  await sheet.getByRole('textbox', { name: 'Preis', exact: true }).fill('18,50')
  await sheet.getByRole('button', { name: 'Morgen' }).click()
  await sheet.getByRole('button', { name: `Ab ${shortDay(tomorrow)} veröffentlichen` }).click()
  await expect(toast(page)).toContainText(`Gespeichert. Auf der Website ab ${longDay(tomorrow)}.`)
  await expect(sheet).toHaveCount(0)
  expect(onlinePrice(DISH)).toBe(before)

  await openPrice(page)
  await expect(page.locator('[data-test="dated-waiting"]')).toHaveText(`Ab ${longDay(tomorrow)}: Preis 18,50 €.`)
})

// Wrong behaviour caught: "Bearbeiten" and a save on the same day planned a second change next to the first one.
test('"Bearbeiten" on the waiting change and another price for the same day leaves one change with the new price', async ({ page }) => {
  const tomorrow = addDays(today(), 1)
  await planForTomorrow(page, '18,50')
  const sheet = await openPrice(page)
  await sheet.getByRole('button', { name: 'Bearbeiten' }).click()
  const price = sheet.getByRole('textbox', { name: 'Preis', exact: true })
  await expect(price).toHaveValue('18,50')
  await price.fill('19,00')
  await sheet.getByRole('button', { name: `Ab ${shortDay(tomorrow)} veröffentlichen` }).click()
  await expect(sheet).toHaveCount(0)

  await openPrice(page)
  await expect(page.locator('[data-test="dated-waiting"]')).toHaveText([`Ab ${longDay(tomorrow)}: Preis 19,00 €.`])
})

// Wrong behaviour caught: cancelling the change in Alles bearbeiten left it waiting, or left its notice on screen.
test('"Änderung aufheben" in Alles bearbeiten takes the change out and its notice goes', async ({ page }) => {
  await planForTomorrow(page, '18,50')
  await page.goto('/s/restaurant/all/menu', { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: DISH }).click()
  const notices = page.locator('[data-test="dated-notices"]')
  await expect(notices).toContainText(`Ab ${longDay(addDays(today(), 1))}: Preis 18,50 €.`)
  await notices.getByRole('button', { name: 'Änderung aufheben' }).click()
  await expect(notices.getByRole('alert')).toHaveText('Diese geplante Änderung aufheben? Das lässt sich nicht rückgängig machen.')
  await notices.getByRole('button', { name: 'Änderung aufheben' }).click()
  await expect(toast(page)).toContainText('Geplante Änderung aufgehoben.')
  await expect(notices).toHaveCount(0)

  await openPrice(page)
  await expect(page.locator('[data-test="dated-waiting"]')).toHaveCount(0)
})

// Wrong behaviour caught: a day that is not after today was sent, so the price went online at once or a change waited
// for a day that has begun.
test('a day that is not after today is refused and nothing is saved', async ({ page }) => {
  const before = onlinePrice(DISH)
  const sheet = await openPrice(page)
  await sheet.getByRole('textbox', { name: 'Preis', exact: true }).fill('18,50')
  const day = sheet.locator('#sheet-starts-on')
  await day.fill(today())
  await sheet.getByRole('button', { name: `Ab ${shortDay(today())} veröffentlichen` }).click()
  await expect(sheet.getByText('Der Tag muss nach heute liegen.')).toBeVisible()
  await expect(day).toBeFocused()
  await expect(sheet).toBeVisible()
  expect(onlinePrice(DISH)).toBe(before)
  await expect(sheet.locator('[data-test="dated-waiting"]')).toHaveCount(0)
})
