// The menu feature on the built template (gate 3): prices, allergen letters with their key, the lunch week and the
// print page.
import { expect, open, site, test } from '../../../../scripts/templates/e2e/helpers.ts'

test('every allergen letter on the menu is explained in the key, and prices are in euros', async ({ page }) => {
  await open(page, '/menu')
  const letters = await page.locator('main abbr span[aria-hidden="true"]').allInnerTexts()
  expect(letters.length, 'allergen letters on the menu').toBeGreaterThan(0)
  const key = await page.locator('main dl dt').allInnerTexts()
  // Wrong behaviour caught: a letter on a dish that the visitor cannot look up (a wrong allergen is a "must never").
  expect([...new Set(letters)].filter((letter) => !key.includes(letter)), 'letters without a key entry').toEqual([])
  const prices = await page.locator('main li p.tabular-nums').allInnerTexts()
  expect(prices.length).toBeGreaterThan(0)
  for (const price of prices) expect(price, 'a price with the currency').toMatch(/€\s?\d+[.,]\d{2}/)
})

test('the lunch page shows the current week with weekdays, or says it follows', async ({ page }) => {
  await open(page, '/lunch')
  const days = page.locator('main ol > li')
  const count = await days.count()
  if (count === 0) await expect(page.locator('main header p')).toBeVisible()
  else {
    expect(count, 'five lunch days').toBe(5)
    // Wrong behaviour caught: an old week left online; the current week marks today on a weekday.
    const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/Vienna' }).format(new Date(site.now))
    if (!['Sat', 'Sun'].includes(day)) await expect(page.locator('main ol > li[aria-current="date"]'), 'today marked').toHaveCount(1)
  }
})

test('the print page has no site header and is not indexed', async ({ page }) => {
  await open(page, '/menu')
  const href = await page.locator('main a[href*="print"], main a[href$="/drucken"], main a[href$="/stampa"]').first().getAttribute('href')
  expect(href, 'a link to the print page').toBeTruthy()
  const response = await open(page, href!)
  expect(response?.status()).toBe(200)
  // Wrong behaviour caught: the print copy competing with the menu page in search, or printing the navigation.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  await expect(page.locator('header nav')).toHaveCount(0)
  await expect(page.locator('h1')).toHaveCount(1)
})
