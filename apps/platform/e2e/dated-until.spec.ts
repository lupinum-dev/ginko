// A change with an end (slice 3): "Aktionspreis" for some days and "Heute nicht auf der Karte" for today, as the owner
// sets them, at 390 and 1440 px. What the website shows is read from the local bundle (`shownDish`); the stored entry
// (`onlinePrice`) keeps the normal value, because an exception is never written into the entry.
// The start and end runs on a later day are covered by the server tests (dated-until.test.ts): no clock override here.
import { addDays, todayIn } from '@lupinum/ginko/internal'
import { expect, test, type Page } from '@playwright/test'
import { STATE } from './global-setup'
import { onlinePrice, openQuick, resetContent, shownDish, storedDish } from './local'

const DISH = 'Kürbisrisotto'
const today = () => todayIn('Europe/Vienna')
const fmt = (day: string, o: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00Z`).toLocaleDateString('de', { ...o, timeZone: 'UTC' })
/** "26. Nov.": the days in the button and the hint. */
const short = (day: string) => fmt(day, { day: 'numeric', month: 'short' })
/** "So., 6. Dez.": the days of a notice. */
const withDay = (day: string) => fmt(day, { weekday: 'short', day: 'numeric', month: 'short' })
const euro = (cents: number) => `${(cents / 100).toLocaleString('de', { minimumFractionDigits: 2 })} €`
const shownPrice = () => shownDish(DISH)?.data.price?.amount

test.use({ storageState: STATE.owner })
test.beforeEach(() => resetContent())

const toast = (page: Page) => page.locator('[data-sonner-toast]').filter({ hasText: /Gespeichert|Veröffentlicht/ })

/** Opens a quick task for the dish and returns the sheet. */
async function openTask(page: Page, task: string) {
  await openQuick(page)
  await page.getByRole('button', { name: task }).click()
  await page.getByRole('searchbox').fill('risotto')
  await page.getByRole('button', { name: DISH }).click()
  return page.getByRole('dialog')
}

/** Types an offer price with both days; an empty `from` leaves "Gilt ab" empty (today). */
async function typeOffer(page: Page, price: string, from: string, until: string) {
  const sheet = await openTask(page, 'Aktionspreis')
  await sheet.getByRole('textbox', { name: 'Preis', exact: true }).fill(price)
  if (from) await sheet.locator('#sheet-starts-on').fill(from)
  await sheet.locator('#sheet-until').fill(until)
  return sheet
}

// Wrong behaviour caught: an offer for later days went online at once, was saved without its end (so the price would
// change for good), or the button and the notice do not name both days.
test('an offer from tomorrow waits: the button names both days, the website keeps the normal price', async ({ page }) => {
  const normal = onlinePrice(DISH)!
  const [from, until] = [addDays(today(), 1), addDays(today(), 30)]
  const sheet = await typeOffer(page, '9,90', from, until)
  await sheet.getByRole('button', { name: `Für ${short(from)} bis ${short(until)} veröffentlichen` }).click()
  await expect(toast(page)).toBeVisible()
  await expect(sheet).toHaveCount(0)
  expect([onlinePrice(DISH), shownPrice()]).toEqual([normal, normal])

  await openTask(page, 'Aktionspreis')
  await expect(page.locator('[data-test="dated-waiting"]')).toHaveText([`Von ${withDay(from)} bis ${withDay(until)}: Preis 9,90 €`])
})

// Wrong behaviour caught: an offer from today waited for a run that never comes, or was written into the entry, so the
// normal price is lost and does not come back after the end; the normal price sheet hides that the website shows another.
test('an offer from today shows at once, the entry keeps its price, and the price sheet says what the website shows', async ({ page }) => {
  const normal = onlinePrice(DISH)!
  const until = addDays(today(), 30)
  const sheet = await typeOffer(page, '9,90', '', until)
  await sheet.getByRole('button', { name: `Bis ${short(until)} veröffentlichen` }).click()
  await expect(toast(page)).toBeVisible()
  await expect.poll(shownPrice).toBe(990)
  expect(onlinePrice(DISH)).toBe(normal)

  const price = await openTask(page, 'Preis ändern')
  await expect(price.getByRole('textbox', { name: 'Preis', exact: true })).toHaveValue(euro(normal).replace(' €', ''))
  await expect(price.locator('[data-test="covered-hint"]')).toHaveText(`Die Website zeigt bis ${short(until)} 9,90 €.`)
  await expect(price.locator('[data-test="dated-waiting"]')).toHaveText([`Bis ${withDay(until)} zeigt die Website: Preis 9,90 € (sonst ${euro(normal)})`])
})

// Wrong behaviour caught: "Jetzt beenden" ended nothing, ended it without asking, or left the offer price on the website.
test('"Jetzt beenden" in Alles bearbeiten asks first, then the normal price is back on the website', async ({ page }) => {
  const normal = onlinePrice(DISH)!
  const until = addDays(today(), 30)
  await (await typeOffer(page, '9,90', '', until)).getByRole('button', { name: `Bis ${short(until)} veröffentlichen` }).click()
  await expect.poll(shownPrice).toBe(990)

  await page.goto('/s/restaurant/all/menu', { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: DISH }).click()
  const notices = page.locator('[data-test="dated-notices"]')
  await expect(notices).toContainText(`Bis ${withDay(until)} zeigt die Website: Preis 9,90 € (sonst ${euro(normal)})`)
  await notices.getByRole('button', { name: 'Jetzt beenden' }).click()
  await expect(notices.getByRole('alert')).toBeVisible()
  expect(shownPrice()).toBe(990)
  await notices.getByRole('button', { name: 'Jetzt beenden' }).click()
  await expect(notices).toHaveCount(0)
  await expect.poll(shownPrice).toBe(normal)
  expect(onlinePrice(DISH)).toBe(normal)
})

// Wrong behaviour caught: the today-only task asked for days or a second confirmation, wrote "off" into the entry (so the
// dish stays off tomorrow), or did not take the dish off the website today.
test('"Heute nicht auf der Karte" takes the dish off today with one labelled press and keeps it on the menu in the entry', async ({ page }) => {
  const sheet = await openTask(page, 'Heute nicht auf der Karte')
  await expect(sheet.locator('#sheet-starts-on')).toHaveCount(0)
  await expect(sheet.locator('#sheet-until')).toHaveCount(0)
  await expect(sheet.locator('[data-test="today-only"]')).toBeVisible()
  await sheet.getByRole('button', { name: 'Für heute veröffentlichen' }).click()
  await expect(toast(page)).toBeVisible()
  await expect(sheet).toHaveCount(0)
  await expect.poll(() => shownDish(DISH)?.data.onMenu).toBe(false)
  expect(shownDish(DISH)?.holding).toBeUndefined()
  expect(storedDish(DISH)?.onMenu).toBe(true)
})

// Wrong behaviour caught (number 5): the answer to a conflict saved the offer, or saved it without a day; after the
// answer the button no longer names both days.
test('a conflict while typing an offer: the answer writes nothing and the button still names both days', async ({ page, browser }) => {
  const [from, until] = [addDays(today(), 2), addDays(today(), 30)]
  const sheet = await typeOffer(page, '9,90', from, until)

  // Meanwhile the owner changes the normal price on her phone.
  const other = await browser.newPage({ storageState: STATE.owner, viewport: { width: 390, height: 844 } })
  const priceSheet = await openTask(other, 'Preis ändern')
  await priceSheet.getByRole('textbox', { name: 'Preis', exact: true }).fill('23')
  await priceSheet.getByRole('button', { name: 'Veröffentlichen', exact: true }).click()
  await expect(toast(other)).toContainText('Veröffentlicht')
  await other.close()

  const primary = `Für ${short(from)} bis ${short(until)} veröffentlichen`
  await sheet.getByRole('button', { name: primary }).click()
  const conflict = sheet.getByRole('alert')
  await expect(conflict).toContainText('23,00')
  await expect(conflict).toContainText('9,90')
  await conflict.getByRole('button', { name: 'Meine Eingaben behalten' }).click()
  await expect(sheet.getByText('Deine Eingaben stehen im Formular. Sie sind noch nicht gespeichert.')).toBeVisible()
  await expect(sheet.getByRole('button', { name: primary })).toBeVisible()
  expect([onlinePrice(DISH), shownPrice()]).toEqual([2300, 2300])
  await expect(sheet.locator('[data-test="dated-waiting"]')).toHaveCount(0)
})
