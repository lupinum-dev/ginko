// The site preview (SPEC 8 "Vorschau"): the platform frames /__ginko/preview and sends a bundle by message.
import { readFileSync } from 'node:fs'
import { expect, test, type APIRequestContext } from '@playwright/test'

const platform = 'http://localhost:3999'
const preview = (path: string, session: string) => `/__ginko/preview?path=${encodeURIComponent(path)}&locale=de&session=${session}`
const framed = (path: string, session: string) => `${platform}/__parent?src=${encodeURIComponent(`http://localhost:3201${preview(path, session)}`)}`
const recorded = async (request: APIRequestContext, url: string) => (await (await request.get(`${platform}${url}`)).json()) as unknown[]

// The preview shell speaks the owner's language (the browser's); these owners read German.
test.use({ locale: 'de-AT' })

test.beforeEach(async ({ request }) => { await request.get(`${platform}/__control?mode=ok`) })

test('shows the bundle the platform sends, and fetches none', async ({ page, request }) => {
  await page.goto(framed('/', 's-show'))
  await expect(page.frameLocator('#preview').locator('[data-test=notice]').first()).toHaveText('VORSCHAU')
  expect(await recorded(request, '/__control/requests')).toEqual([])
})

test('ignores a message that does not come from the platform', async ({ page }) => {
  await page.goto(preview('/', 's-foreign'))
  const bundle = JSON.parse(readFileSync(new URL('../contracts/restaurant/bundle.format3.de.json', import.meta.url), 'utf8'))
  // Posted from the page itself: the origin is the site, not the platform.
  await page.evaluate((data) => window.postMessage(data, '*'), { type: 'ginko:preview', session: 's-foreign', site: 'restaurant', locale: 'de', bundle })
  await expect(page.getByText('Vorschau lädt nicht')).toBeVisible({ timeout: 10_000 })
})

test.describe('an unsafe or unknown path shows the error text', () => {
  for (const path of ['//evil.com', '/../x', '/veranstaltungen/%2e%2e', '/veranstaltungen/%5c', '/veranstaltungen/%2f%2fevil.test']) {
    test(path, async ({ page }) => {
      await page.goto(preview(path, 's-path'))
      await expect(page.getByText('Diese Seite gibt es nicht.')).toBeVisible()
      await expect(page).toHaveURL(/\/__ginko\/preview\?/)
    })
  }
})

test('a link in the preview does not navigate and reports to the platform', async ({ page, request }) => {
  await page.goto(framed('/', 's-link'))
  const frame = page.frameLocator('#preview')
  await expect(frame.locator('[data-test=notice]').first()).toHaveText('VORSCHAU')
  await frame.locator('main').evaluate((main) => main.insertAdjacentHTML('beforeend', '<a href="/x" data-test="link">Link</a>'))
  await frame.locator('[data-test=link]').click()
  await expect.poll(() => recorded(request, '/__control/messages')).toEqual([{ type: 'ginko:navigate', session: 's-link', path: '/x' }])
  await expect(frame.locator('[data-test=link]')).toBeVisible()
})

test('a middle click on a link in the preview does not navigate and reports to the platform', async ({ page, request }) => {
  await page.goto(framed('/', 's-aux'))
  const frame = page.frameLocator('#preview')
  await expect(frame.locator('[data-test=notice]').first()).toHaveText('VORSCHAU')
  await frame.locator('main').evaluate((main) => main.insertAdjacentHTML('beforeend', '<a href="/x" data-test="link">Link</a>'))
  const cancelled = await frame.locator('[data-test=link]').evaluate((link) => !link.dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true })))
  expect(cancelled).toBe(true)
  await expect.poll(() => recorded(request, '/__control/messages')).toEqual([{ type: 'ginko:navigate', session: 's-aux', path: '/x' }])
  await expect(frame.locator('[data-test=link]')).toBeVisible()
})

test('the preview is never cached and only the platform may frame it', async ({ request }) => {
  const response = await request.get(preview('/', 's-headers'))
  expect(response.headers()['cache-control']).toBe('no-store')
  expect(response.headers()['content-security-policy']).toBe('frame-ancestors http://localhost:3999')
})
