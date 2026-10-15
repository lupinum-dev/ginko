// The restaurant site against the platform contract (SPEC 8): content, revision proof, 503 rule.
import { expect, test } from '@playwright/test'
import { todayIn } from '../packages/ginko/src/core/index.ts'

const platform = `http://localhost:${process.env.FAKE_PLATFORM_PORT ?? 3999}`
test.afterEach(async ({ request }) => { await request.get(`${platform}/__control?mode=ok`) })

test('renders the bundle and proves its revision', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  expect(response?.headers()['x-ginko-rev']).toMatch(/^\d+\.\d+$/)
  await expect(page.locator('[data-test=notice]').first()).toBeVisible()
})

// Wrong behaviour caught: a Markdown field arrives as a string or a tree the site cannot render, so the text,
// its line breaks or its link is missing.
test('a Markdown text renders with its link and line breaks', async ({ page }) => {
  await page.goto('/impressum')
  const text = page.locator('.prose').first()
  await expect(text).toContainText('Inhaberin: Maria Ebner')
  await expect(text.locator('br')).toHaveCount(4)
  await expect(text.locator('a[href="https://www.ris.bka.gv.at"]')).toBeVisible()
})

test('a platform failure is a 503, never a 404', async ({ page, request }) => {
  await request.get(`${platform}/__control?mode=503`)
  const response = await page.goto('/')
  expect(response?.status()).toBe(503)
})

// Wrong behaviour caught: a non-fatal 404 from useGinkoEntry shows the error page only on a full load; after a
// client-side navigation to a missing slug the page stayed broken.
test('a client-side navigation to a missing entry shows the 404 page', async ({ page }) => {
  await page.goto('/veranstaltungen/weinabend-ebner')
  await page.waitForFunction(() => (document.querySelector('#__nuxt') as { __vue_app__?: unknown } | null)?.__vue_app__)
  await page.evaluate(() => {
    const app = (document.querySelector('#__nuxt') as unknown as { __vue_app__: { config: { globalProperties: { $router: { push: (to: string) => Promise<unknown> } } } } }).__vue_app__
    return app.config.globalProperties.$router.push('/veranstaltungen/gibt-es-nicht')
  })
  await expect(page.getByRole('heading', { name: 'Diese Seite gibt es nicht.' })).toBeVisible()
})

// Break-it 9: a hanging or oversized platform answer is a quick 503; an unknown brick key never breaks the page.
for (const [mode, status] of [['hang', 503], ['huge', 503], ['proto', 200]] as const) {
  test(`a platform answer of kind "${mode}" gives ${status}`, async ({ page, request }) => {
    await request.get(`${platform}/__control?mode=${mode}`)
    const started = Date.now()
    const response = await page.goto('/', { timeout: 20_000 })
    expect(response?.status()).toBe(status)
    expect(Date.now() - started).toBeLessThan(15_000)
  })
}

test('forwards a valid x-ginko-min-rev and ignores an invalid one', async ({ request }) => {
  await request.get(`${platform}/__control?mode=ok`)
  await request.get('/', { headers: { 'x-ginko-min-rev': '3.17' } })
  await request.get('/', { headers: { 'x-ginko-min-rev': '3;drop' } })
  const seen = await (await request.get(`${platform}/__control/requests`)).json() as { minRev: string | null }[]
  expect(seen.map((r) => r.minRev)).toEqual(['3.17', null])
})

// DEMOS: no cookies, self-hosted fonts. A font or image from a CDN would send visitors' IPs to a third party.
test('every page loads from this site only, in its language, without a cookie', async ({ page, context }) => {
  const foreign: string[] = []
  page.on('request', (request) => {
    const host = new URL(request.url()).hostname
    if (host !== 'localhost') foreign.push(request.url())
  })
  const pages = [
    ['/', 'de-AT'], ['/speisekarte', 'de-AT'], ['/mittagsmenue', 'de-AT'], ['/veranstaltungen', 'de-AT'], ['/veranstaltungen/weinabend-ebner', 'de-AT'],
    ['/galerie', 'de-AT'], ['/impressum', 'de-AT'], ['/datenschutz', 'de-AT'], ['/en', 'en-GB'], ['/en/menu', 'en-GB'], ['/en/events/wine-evening-ebner', 'en-GB'],
  ] as const
  for (const [path, lang] of pages) {
    const response = await page.goto(path, { waitUntil: 'networkidle' })
    expect([path, response?.status(), await page.locator('html').getAttribute('lang')]).toEqual([path, 200, lang])
  }
  expect(foreign).toEqual([])
  expect(await context.cookies()).toEqual([])
})

// Astra phase 7: a tab left open over midnight showed yesterday's board (closure, lunch) until reload.
test('the Heute board moves to the new day at midnight in Vienna without a reload', async ({ page }) => {
  const today = todayIn('Europe/Vienna')
  // The last minute before Vienna's midnight on the server's today.
  let t = Date.now()
  while (todayIn('Europe/Vienna', new Date(t + 60_000)) === today) t += 60_000
  await page.clock.install({ time: new Date(t - 30_000) })
  await page.goto('/')
  const board = page.locator('#board-title')
  const before = await board.textContent()
  await page.clock.runFor(120_000)
  await expect(board).not.toHaveText(before!)
})

// Wrong behaviour caught: on a day the owner closed, the site still said "Heute sind wir ausgebucht.", showed today's
// normal hours in the table and tagged today's lunch "Heute", so a guest read the house as open.
test('a closure today wins on the board, in the hours table and in the lunch week', async ({ page, request }) => {
  await request.get(`${platform}/__control?mode=closedToday`)
  await page.goto('/')
  await expect(page.locator('[data-test=status]')).toContainText('Heute geschlossen')
  await expect(page.locator('[data-test=notice]').filter({ hasText: 'Heute sind wir ausgebucht.' })).toHaveCount(0)
  await expect(page.locator('.hours tr.today td')).toHaveText('Heute geschlossen')
  // On the weekend the lunch list is the coming week, without a row for today.
  const weekend = [0, 6].includes(new Date(`${todayIn('Europe/Vienna')}T12:00:00Z`).getUTCDay())
  if (!weekend) await expect(page.locator('[data-test=lunch][aria-current=date] .tag')).toHaveText('Heute geschlossen')
})

// Wrong behaviour caught: a day set in "Geschlossen am" for tomorrow was not announced until it was today.
test('a closure set for tomorrow is announced on the board and in the hours table', async ({ page, request }) => {
  await request.get(`${platform}/__control?mode=closedTomorrow`)
  await page.goto('/')
  await expect(page.locator('.closure').filter({ hasText: 'Wasserrohrbruch' })).toContainText('geschlossen')
  await expect(page.locator('.hours .exceptions li').filter({ hasText: 'Wasserrohrbruch' }).locator('.state')).toHaveText('Geschlossen')
})

// Wrong behaviour caught: a dish taken off the menu after its season was still listed (with its allergen letters), a
// dish sold out today was not marked, and a fully booked event still offered "Platz reservieren".
test('the menu leaves out a dish off the menu and marks one sold out today; a fully booked event cannot be booked', async ({ page, request }) => {
  await request.get(`${platform}/__control?mode=availability`)
  await page.goto('/speisekarte')
  await expect(page.getByRole('heading', { name: 'Frittatensuppe' })).toHaveCount(0)
  // L is Frittatensuppe's letter only.
  await expect(page.locator('.legend dt').filter({ hasText: /^L$/ })).toHaveCount(0)
  await expect(page.locator('.dish').filter({ hasText: 'Wiener Schnitzel vom Kalb' }).locator('[data-test=sold-out]')).toHaveText('heute aus')
  await page.goto('/veranstaltungen/martini-gansl')
  await expect(page.locator('[data-test=fully-booked]')).toHaveText('Ausgebucht')
  await expect(page.getByRole('link', { name: 'Platz reservieren' })).toHaveCount(0)
  expect((await page.locator('script[type="application/ld+json"]').allTextContents()).join()).toContain('https://schema.org/SoldOut')
})

// Astra phase 7: untranslated texts must keep their language, and allergen letters need a visible key.
test('fallback alt texts keep their language, and the lunch page explains the allergen letters', async ({ page }) => {
  await page.goto('/en/gallery')
  await expect(page.getByAltText('Wiener Schnitzel auf dem Teller')).toHaveAttribute('lang', 'de-AT')
  await expect(page.getByAltText('Dining room with wood panelling')).not.toHaveAttribute('lang', /./)
  await page.goto('/mittagsmenue')
  await expect(page.getByRole('heading', { name: 'Allergene' })).toBeVisible()
})

// Phase 12: a detail page's other language is its entry's URL there (another slug), from the bundle via ginko-i18n.
test('a detail page links the entry in the other language, also in the head', async ({ page }) => {
  await page.goto('/en/events/wine-evening-ebner')
  await expect(page.locator('a.lang')).toHaveAttribute('href', '/veranstaltungen/weinabend-ebner')
  await expect(page.locator('link[rel=alternate][hreflang=de-AT]')).toHaveAttribute('href', /\/veranstaltungen\/weinabend-ebner$/)
})

// Wrong behaviour caught: a German-only event was served under /en with German text, lang="en" and an English hreflang.
test('a German-only event has no English page and no English alternate', async ({ page, request }) => {
  expect((await request.get('/en/events/martini-gansl')).status()).toBe(404)
  await page.goto('/veranstaltungen/martini-gansl')
  await expect(page.locator('link[rel=alternate][hreflang=en-GB]')).toHaveCount(0)
})

// Wrong behaviour caught: the stored start time is not shown (or shown in the wrong format or shifted by the
// site time zone), or an event without a time gets a stray time.
test('an event shows its start time in the page language, one without a time shows the date only', async ({ page }) => {
  await page.goto('/veranstaltungen')
  const list = page.locator('.event')
  await expect(list.filter({ hasText: 'Weinabend' }).locator('.meta')).toContainText('16. Oktober 2026, 19:00 Uhr')
  await expect(list.filter({ hasText: 'Martini' }).locator('.meta')).not.toContainText(/\d:\d\d/)
  await page.goto('/en/events/wine-evening-ebner')
  await expect(page.locator('.when')).toHaveText('16 October 2026, 7:00 pm')
})

// Wrong behaviour caught: a 404 said its canonical address was the missing URL and linked hreflang
// alternates to other missing URLs, so search engines were invited to index error pages.
test('a 404 page has no canonical or alternates and is noindex', async ({ page }) => {
  const response = await page.goto('/gibt-es-nicht')
  expect(response?.status()).toBe(404)
  await expect(page.locator('link[rel=canonical]')).toHaveCount(0)
  await expect(page.locator('link[rel=alternate][hreflang]')).toHaveCount(0)
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex')
})

// Wrong behaviour caught: vue-router matches any case, so every case variant of a page answered 200 with
// its own canonical address and search engines saw duplicate pages.
test('a page in another case redirects to its own spelling', async ({ request }) => {
  const german = await request.get('/VERANSTALTUNGEN', { maxRedirects: 0 })
  const english = await request.get('/en/EVENTS', { maxRedirects: 0 })
  expect([german.status(), english.status()]).toEqual([301, 301])
  expect([german.headers().location, english.headers().location]).toEqual(['/veranstaltungen', '/en/events'])
})
