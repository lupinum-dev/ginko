// The restaurant site against the platform contract (SPEC 8): content, revision proof, 503 rule.
import { expect, test } from '@playwright/test'
import { todayIn } from '../packages/ginko/src/core/index.ts'

const platform = 'http://localhost:3999'
test.afterEach(async ({ request }) => { await request.get(`${platform}/__control?mode=ok`) })

test('renders the bundle and proves its revision', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  expect(response?.headers()['x-ginko-rev']).toMatch(/^\d+\.\d+$/)
  await expect(page.locator('[data-test=notice]').first()).toBeVisible()
})

// Wrong behaviour caught: a Markdown field arrives as a string or a tree the site cannot render, so the text,
// its line break or its link is missing.
test('a Markdown text renders with its link and line break', async ({ page }) => {
  await page.goto('/impressum')
  const text = page.locator('.prose').first()
  await expect(text).toContainText('Inhaberin Maria Ebner')
  await expect(text.locator('br')).toHaveCount(1)
  await expect(text.locator('a[href="mailto:office@gasthaus-linde.example"]')).toBeVisible()
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
