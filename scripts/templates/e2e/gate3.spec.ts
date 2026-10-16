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

// The footer is the page that shows the contact details on every page. Wrong behaviour caught: a footer or imprint
// with a copy of the address in code or in a text, so a change in content/site.md leaves the page behind.
test('every page shows the email and phone of content/site.md in its footer', async ({ page }) => {
  const { email, phone } = site.contact
  test.skip(!email && !phone, 'content/site.md has neither email nor phone')
  for (const path of await sitePages()) {
    await open(page, path)
    const footer = page.locator('footer')
    if (email) await expect.soft(footer.locator(`a[href="mailto:${email}"]`), `${path}: footer email link`).toHaveText(email)
    if (phone) await expect.soft(footer.locator(`a[href^="tel:"]`), `${path}: footer phone link`).toHaveText(phone)
  }
})

// The imprint repeats them as text from the same file. It is the legal text with the imprint rows.
test('the imprint shows the email and phone of content/site.md', async ({ page }) => {
  const { email, phone } = site.contact
  test.skip(!email && !phone, 'content/site.md has neither email nor phone')
  test.skip(!site.imprint, 'the template has no content/legal file with legalType: imprint')
  await open(page, site.imprint)
  const main = page.locator('main')
  if (email) await expect(main, 'imprint email').toContainText(email)
  if (phone) await expect(main, 'imprint phone').toContainText(phone)
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

// Phones: the switch is in the nav sheet (full names); from `md` up: codes in the header. A link counts for a locale
// when its hreflang or lang has that language, also with a region (`de-AT` counts as `de`).
for (const [width, where] of [[390, 'the nav sheet'], [1440, 'the header']] as const) {
  test(`the language switch in ${where} (${width} px) leads to each other language`, async ({ page }) => {
    test.skip(site.locales.length < 2, 'one language: no switch')
    await page.setViewportSize({ width, height: 900 })
    for (const locale of site.locales.slice(1)) {
      await open(page, '/')
      let scope = page.locator('header')
      if (width < 768) {
        await navToggle(page).click()
        scope = page.getByRole('dialog')
      }
      // A header that keeps its languages in a menu (the docs layer: a button named "Language" with the links in a
      // popover) opens it first. The site feature's header shows the links themselves and has no such button.
      const menu = scope.getByRole('button', { name: /^(language|sprache)\b/i })
      if (await menu.isVisible() && await menu.getAttribute('aria-expanded') === 'false') await menu.click()
      const language = locale.split('-')[0]
      const link = scope.locator(`a[hreflang|="${language}"], a[lang|="${language}"]`).first()
      await expect(link, `switch to ${locale} in ${where}`).toBeVisible()
      await Promise.all([page.waitForURL((url) => url.pathname !== '/'), link.click()])
      await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${language}(-|$)`))
    }
  })
}

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
