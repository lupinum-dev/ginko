// Gate 3 (TEMPLATES.md §9): end to end on the built site, with the test instant on the server and in the browser.
import { expect, navToggle, open, site, sitePages, test, themeToggle } from './helpers.ts'

test('home and every page of the sitemap answer 200 with one h1 and a JSON-LD type', async ({ page }) => {
  const pages = await sitePages()
  // Wrong behaviour caught: a sitemap that lists only the home page while feature pages exist.
  expect(pages.length, 'sitemap entries besides home').toBeGreaterThan(1)
  for (const path of pages) {
    const response = await open(page, path)
    expect.soft(response?.status(), `${path} status`).toBe(200)
    expect.soft(await page.locator('h1').count(), `${path} h1 count`).toBe(1)
    const types = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts) => scripts.flatMap((script) => {
      try {
        const data = JSON.parse(script.textContent ?? '')
        const nodes = Array.isArray(data) ? data : data['@graph'] ?? [data]
        return nodes.map((node: { '@type'?: string | string[] }) => node['@type']).flat().filter(Boolean)
      } catch { return ['(invalid JSON)'] }
    }))
    expect.soft(types.filter((type) => type !== '(invalid JSON)').length, `${path} JSON-LD @type (found: ${types.join(', ') || 'none'})`).toBeGreaterThan(0)
    expect.soft(types, `${path} JSON-LD is valid JSON`).not.toContain('(invalid JSON)')
  }
})

test('llms.txt lists the site pages and each link answers 200', async ({ request }) => {
  const response = await request.get('/llms.txt')
  expect(response.status()).toBe(200)
  const links = [...(await response.text()).matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]!)
  expect(links.length, 'links in llms.txt').toBeGreaterThan(0)
  for (const link of links) {
    const path = link.startsWith('http') ? new URL(link).pathname : link
    expect.soft((await request.get(path)).status(), `llms.txt link ${link}`).toBe(200)
  }
})

test('an unknown address answers 404 and is not indexed', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist-0b5e')
  expect(response?.status()).toBe(404)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})

test('the language switch leads to the same page in each other language', async ({ page }) => {
  test.skip(site.locales.length < 2, 'one language: no switch')
  await open(page, '/')
  for (const locale of site.locales.slice(1)) {
    // By language: a regional hreflang or lang (`de-AT`) counts as `de`.
    const language = locale.split('-')[0]
    const link = page.locator(`header a[hreflang|="${language}"], header a[lang|="${language}"]`).first()
    await expect(link, `switch to ${locale}`).toBeVisible()
    await Promise.all([page.waitForURL((url) => url.pathname !== '/'), link.click()])
    await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${language}(-|$)`))
    await open(page, '/')
  }
})

test('the theme toggle switches between light and dark', async ({ page }) => {
  await open(page, '/')
  const toggle = themeToggle(page)
  await expect(toggle, 'a theme toggle in the header').toBeVisible()
  const scheme = () => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme + document.documentElement.className + (document.documentElement.dataset.theme ?? ''))
  const before = await scheme()
  await toggle.click()
  await expect.poll(scheme).not.toBe(before)
})

test('on a phone the navigation is reachable and its links are visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page, '/')
  const nav = page.locator('header nav, nav[aria-label]').first()
  const toggle = navToggle(page)
  if (await toggle.isVisible()) {
    await toggle.click()
    const sheet = page.getByRole('dialog').or(nav)
    await expect(sheet.getByRole('link').first()).toBeVisible()
  }
  else {
    await expect(nav.getByRole('link').first(), 'nav links without a toggle').toBeVisible()
  }
})
