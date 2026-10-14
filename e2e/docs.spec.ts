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

// The docs layer keeps `source` in its bundle through the 'ginko:files' hook; without it the link falls back to the Studio.
test('"edit this page" opens the file in the GitHub repository', async ({ page }) => {
  await page.goto(`${origin}/docs/einstieg`)
  await expect(page.locator('.docs-page-foot a').first()).toHaveAttribute('href', /^https:\/\/github\.com\/lupinum-dev\/ginko\//)
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

test('a ```md preview fence shows its two tabs by name', async ({ page }) => {
  await page.goto(`${origin}/docs/komponenten`)
  const tabs = page.locator('.docs-example').first().getByRole('tab')
  await expect(tabs).toHaveText(['Vorschau', 'Markdown'])
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

// Wrong behaviour caught: the normal address answers an agent's `Accept: text/markdown` with Markdown. The host's
// page cache ignores `Vary`, so every visitor would then get that Markdown instead of the page.
test('Markdown only at the .md address: the page stays HTML for any Accept and links its twin', async ({ request }) => {
  const page = await request.get(`${origin}/docs/einstieg`, { headers: { accept: 'text/markdown' } })
  expect(page.headers()['content-type']).toContain('text/html')
  expect(page.headers().link).toContain('</docs/einstieg.md>; rel="alternate"; type="text/markdown"')
  const twin = await request.get(`${origin}/docs/einstieg.md`)
  expect(twin.headers()['content-type']).toContain('text/markdown')
  expect(await twin.text()).toContain('# ')
})
