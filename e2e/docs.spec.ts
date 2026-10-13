// The docs site on @lupinum/ginko-docs (CONTENT.md): texts load per page, also on client navigation; search works.
import { expect, test } from '@playwright/test'

const origin = 'http://localhost:3204'

test('a page carries only its own text, and client navigation loads the next one', async ({ page }) => {
  const response = await page.goto(`${origin}/docs/einstieg`)
  // The text of the next page ("Umstieg") must not ride along in this page's payload (headings may: toc).
  expect(await response!.text()).not.toContain('Beide lesen Markdown aus')
  await expect(page.locator('pre.shiki').first()).toBeVisible()
  await page.locator('.docs-pager').getByRole('link', { name: /Umstieg/ }).click()
  await expect(page).toHaveURL(`${origin}/docs/umstieg`)
  await expect(page.getByRole('heading', { name: 'Ginko oder Nuxt Content' })).toBeVisible()
})

test('search finds a page by a word in its headings and opens it', async ({ page }) => {
  await page.goto(`${origin}/docs/einstieg`)
  await page.getByRole('button', { name: /Suchen/ }).click()
  await page.getByRole('combobox').fill('sichtbarkeit')
  await page.getByRole('option').filter({ hasText: 'Bausteine' }).first().click()
  await expect(page).toHaveURL(`${origin}/docs/bausteine`)
})

test('a missing page is a 404 inside the site frame, with the header and a way back', async ({ page }) => {
  expect((await page.goto(`${origin}/gibt-es-nicht`))!.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Seite nicht gefunden' })).toBeVisible()
  await expect(page.locator('.docs-header').getByRole('link', { name: 'Ginko' })).toBeVisible()
  // The link to the docs needs the site's content: the error page loaded it.
  await page.locator('.docs-error').getByRole('link', { name: 'Doku' }).click()
  await expect(page).toHaveURL(`${origin}/docs/einstieg`)
})

test('a post marked draft: true is not in the production build', async ({ page }) => {
  expect((await page.goto(`${origin}/blog/entwurf`))!.status()).toBe(404)
  await page.goto(`${origin}/blog`)
  await expect(page.getByRole('link', { name: 'Eine Datei pro Sprache' })).toBeVisible()
  await expect(page.getByText('Ein Entwurf')).toHaveCount(0)
})

test('math renders on the server, mermaid in the browser, and pages without them load neither', async ({ page }) => {
  const response = await page.goto(`${origin}/docs/komponenten`)
  expect(await response!.text()).toContain('class="katex"')
  await expect(page.locator('.katex').first()).toBeVisible()
  await expect(page.locator('.mermaid svg').first()).toBeVisible()
  const plain = await (await page.request.get(`${origin}/docs/einstieg`)).text()
  expect(plain).not.toContain('katex')
})

test('a page without a diagram never requests the mermaid chunk, a page with one does', async ({ page }) => {
  // The diagram engine (mermaid + ELK) is the one script over 1 MB; find it by that, not by its hashed name.
  const scripts: { url: string; body: string }[] = []
  page.on('response', async (response) => {
    if (response.request().resourceType() === 'script') scripts.push({ url: response.url(), body: await response.text().catch(() => '') })
  })
  const isMermaid = (body: string) => body.length > 1_000_000 && body.includes('ELK')

  await page.goto(`${origin}/docs/komponenten`, { waitUntil: 'networkidle' })
  await expect(page.locator('.mermaid svg').first()).toBeVisible()
  const engine = scripts.filter((s) => isMermaid(s.body))
  expect(engine, 'a page with a diagram loads the mermaid chunk').toHaveLength(1)

  scripts.length = 0
  await page.goto(`${origin}/docs/einstieg`, { waitUntil: 'networkidle' })
  expect(scripts.length).toBeGreaterThan(0)
  expect(scripts.filter((s) => s.url === engine[0]!.url || isMermaid(s.body)).map((s) => s.url)).toEqual([])
  expect(await page.locator('link[rel="modulepreload"][href*="' + new URL(engine[0]!.url).pathname.split('/').pop() + '"]').count()).toBe(0)
})

test('with nuxt-og-image installed, a docs page gets a generated share card', async ({ page, request }) => {
  await page.goto(`${origin}/docs/einstieg`)
  const image = await page.locator('meta[property="og:image"]').getAttribute('content')
  expect(image).toMatch(/\/_og\/[sd]\//)
  const response = await request.get(new URL(image!, origin).href)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('image/png')
  expect(await page.locator('meta[name="twitter:image"]').getAttribute('content')).toBe(image)
})
