// A change that comes back every year, and a name (slice 4): the demo's "Saisongericht" puts a dish that is stored "not
// on the menu" on the menu for some days, every year, at 390 and 1440 px. What the website shows is read from the local
// bundle (`shownDish`); the stored entry (`storedDish`) keeps "not on the menu", because such a change is never written
// into the entry. The years themselves (end run, next start) are server tests with a mocked clock
// (dated-yearly.test.ts): no clock override here.
import { addDays, todayIn } from '@lupinum/ginko/internal'
import { expect, test, type Page } from '@playwright/test'
import { STATE } from './global-setup'
import { datedRowsOf, openQuick, resetContent, shownDish, storedDish } from './local'

const DISH = 'Marillenknödel'
const today = () => todayIn('Europe/Vienna')
// The Studio formats German as the site's de-AT ("4. Jän.").
const fmt = (day: string, o: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00Z`).toLocaleDateString('de-AT', { ...o, timeZone: 'UTC' })
/** "26. Nov.": the days in the button and in the notice of a season. */
const short = (day: string) => fmt(day, { day: 'numeric', month: 'short' })
/** "So., 6. Dez.": the days of a notice that names a weekday. */
const withDay = (day: string) => fmt(day, { weekday: 'short', day: 'numeric', month: 'short' })
const shownOnMenu = () => shownDish(DISH)?.data.onMenu ?? true

test.use({ storageState: STATE.owner })
test.beforeEach(() => resetContent())

const toast = (page: Page) => page.locator('[data-sonner-toast]').filter({ hasText: /Gespeichert|Veröffentlicht/ })

/** Opens a quick task for the dish and returns the sheet. */
async function openTask(page: Page, task: string) {
  await openQuick(page)
  await page.getByRole('button', { name: task }).click()
  await page.getByRole('searchbox').fill('marillen')
  await page.getByRole('button', { name: DISH }).click()
  return page.getByRole('dialog')
}

/** "Gericht bearbeiten": the dish on or off the menu, for good (its normal value). */
async function setOnMenu(page: Page, on: boolean) {
  const sheet = await openTask(page, 'Gericht bearbeiten')
  const field = sheet.getByLabel('Auf der Karte')
  if ((await field.getAttribute('aria-checked')) !== String(on)) await field.click()
  await sheet.getByRole('button', { name: 'Veröffentlichen', exact: true }).click()
  await expect(toast(page)).toBeVisible()
  await expect(sheet).toHaveCount(0)
}

/** Types "Saisongericht": both days, the switch (`yearly`) and the name; an empty `from` leaves "Gilt ab" empty (today). */
async function typeSeason(page: Page, from: string, until: string, yearly: boolean, name: string) {
  const sheet = await openTask(page, 'Saisongericht')
  if (from) await sheet.locator('#sheet-starts-on').fill(from)
  await sheet.locator('#sheet-until').fill(until)
  if (yearly) await sheet.locator('#sheet-yearly').click()
  if (name) await sheet.locator('#sheet-name').fill(name)
  return sheet
}

/** The dish in Alles bearbeiten: its notices of changes. */
async function notices(page: Page) {
  await page.goto('/s/restaurant/all/menu', { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: DISH }).click()
  return page.locator('[data-test="dated-notices"]')
}

// Browser test 1 (row "save, yearly on, today inside the days", decision 3). Wrong behaviour caught: a season typed in
// the middle of its days waits a year or is refused, is written into the entry (so the dish stays on the menu after the
// season, every year), or its notice does not say it comes back every year.
test('a season whose days hold today: the page shows the dish, the entry stays off the menu, the notice says it comes back', async ({ page }) => {
  await setOnMenu(page, false)
  const [from, until] = [addDays(today(), -10), addDays(today(), 20)]
  const sheet = await typeSeason(page, from, until, true, 'Marillenzeit')
  await sheet.getByRole('button', { name: `Jedes Jahr ${short(from)} bis ${short(until)} veröffentlichen` }).click()
  await expect(toast(page)).toBeVisible()
  await expect.poll(shownOnMenu).toBe(true)
  expect(storedDish(DISH)?.onMenu).toBe(false)
  const line = (await notices(page)).locator('p').first()
  await expect(line).toContainText(`Marillenzeit: bis ${withDay(until)} zeigt die Website:`)
  await expect(line).toContainText('Kommt jedes Jahr wieder.')
})

// Browser test 2 (row "save, yearly on, days ahead"). Wrong behaviour caught: a season for later days goes online at
// once, or its notice names a year (it holds every year) or reads like a one-off change.
test('a season whose days lie ahead: the page does not show the dish; the notice names the days without a year', async ({ page }) => {
  await setOnMenu(page, false)
  const [from, until] = [addDays(today(), 20), addDays(today(), 30)]
  const sheet = await typeSeason(page, from, until, true, '')
  await sheet.getByRole('button', { name: `Jedes Jahr ${short(from)} bis ${short(until)} veröffentlichen` }).click()
  await expect(toast(page)).toBeVisible()
  await expect(sheet).toHaveCount(0)
  expect([shownOnMenu(), storedDish(DISH)?.onMenu]).toEqual([false, false])
  await expect((await notices(page)).locator('p').first()).toHaveText(`Jedes Jahr von ${short(from)} bis ${short(until)}: Auf der Karte: ja`)
})

// Browser test 3 (row "Änderung aufheben", holds, decision 2). Wrong behaviour caught: the press removes the season
// without asking, the question hides that it does not come back next year, or the website keeps showing the dish.
test('"Änderung aufheben" on a holding season: the question names next year; the page shows the normal value', async ({ page }) => {
  await setOnMenu(page, false)
  const [from, until] = [addDays(today(), -10), addDays(today(), 20)]
  await (await typeSeason(page, from, until, true, 'Marillenzeit')).getByRole('button', { name: `Jedes Jahr ${short(from)} bis ${short(until)} veröffentlichen` }).click()
  await expect.poll(shownOnMenu).toBe(true)

  const box = await notices(page)
  await expect(box.getByRole('button', { name: 'Jetzt beenden' })).toHaveCount(0)
  await box.getByRole('button', { name: 'Änderung aufheben' }).click()
  await expect(box.getByRole('alert')).toContainText('Diese Änderung aufheben? Sie kommt dann auch nächstes Jahr nicht wieder.')
  expect(shownOnMenu()).toBe(true)
  await box.getByRole('button', { name: 'Änderung aufheben' }).click()
  await expect(box).toHaveCount(0)
  await expect.poll(shownOnMenu).toBe(false)
  expect(storedDish(DISH)?.onMenu).toBe(false)
})

// Browser test 4 (row "save with a name only"). Wrong behaviour caught: the name of a one-off change is dropped, so the
// notice cannot lead with it; or the change does not show on the page while its days hold. (`holding` carries the name
// only for a field of `timeline.public`, which onMenu is not: that is the server test "a name without yearly".)
test('a named one-off change: the notice leads with the name; the page shows the dish while the days hold', async ({ page }) => {
  await setOnMenu(page, false)
  const until = addDays(today(), 5)
  await (await typeSeason(page, '', until, false, 'Probewoche')).getByRole('button', { name: `Bis ${short(until)} veröffentlichen` }).click()
  await expect.poll(shownOnMenu).toBe(true)
  await expect((await notices(page)).locator('p').first()).toContainText(`Probewoche: bis ${withDay(until)} zeigt die Website:`)
})

// Browser test 5 (row "someone else saved meanwhile"), for a task with only fixed values: it sends no typed field, so a
// save meanwhile is no conflict (as the today-only task of slice 3). The conflict panel with days, switch and name typed
// is the Studio test "a conflict answer saves nothing; the days, the switch and the name stay". Wrong behaviour caught:
// the meanwhile save blocks the season, makes it twice, or the season writes into the entry or loses the other save.
const meanwhile: [string, (other: Page) => Promise<void>][] = [
  ['the price (a field the season does not touch)', async (other) => {
    const priceSheet = await openTask(other, 'Preis ändern')
    await priceSheet.getByRole('textbox', { name: 'Preis', exact: true }).fill('23')
    await priceSheet.getByRole('button', { name: 'Veröffentlichen', exact: true }).click()
    await expect(toast(other)).toBeVisible()
  }],
  ['"Auf der Karte" itself', (other) => setOnMenu(other, true)],
]
for (const [what, save] of meanwhile) {
  test(`someone else saves ${what} while a season is typed: the season saves once; the entry is theirs`, async ({ page, browser }) => {
    await setOnMenu(page, false)
    const [from, until] = [addDays(today(), 20), addDays(today(), 30)]
    const sheet = await typeSeason(page, from, until, true, 'Marillenzeit')

    const other = await browser.newPage({ storageState: STATE.owner, viewport: { width: 390, height: 844 } })
    await save(other)
    await other.close()
    const theirs = storedDish(DISH)

    await sheet.getByRole('button', { name: `Jedes Jahr ${short(from)} bis ${short(until)} veröffentlichen` }).click()
    await expect(toast(page)).toBeVisible()
    await expect(sheet).toHaveCount(0)
    expect([datedRowsOf(DISH).length, storedDish(DISH)]).toEqual([1, theirs])
  })
}
