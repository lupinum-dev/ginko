// The changelog feature on the built template (gate 3): every release of content/changelog/ is on the changelog page,
// newest first, each language has a feed with the same releases in the same order, and a "latest changes" section on
// the home page starts with the newest release.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, open, site, test } from '../../../../scripts/templates/e2e/helpers.ts'

const dir = fileURLToPath(new URL(`../../../${site.name}/content/changelog/`, import.meta.url))
/** Main-language releases, newest first: version and date as written. */
const releases = existsSync(dir)
  ? readdirSync(dir).filter((file) => /^[^.]+\.md$/.test(file)).map((file) => readFileSync(`${dir}${file}`, 'utf8'))
    .map((text) => ({ version: /^version:\s*['"]?([^'"\s]+)/m.exec(text)![1]!, date: /^date:\s*['"]?(\d{4}-\d{2}-\d{2})/m.exec(text)![1]! }))
    .sort((a, b) => b.date.localeCompare(a.date))
  : []
const anchor = (version: string) => `v${version.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`

/** The changelog page of the main language: the first link of the header that leads to a page with releases. */
async function changelogPage(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, '/')
  for (const href of await page.locator('header nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))) {
    await open(page, href)
    if (await page.locator('main [data-release]').count()) return href
  }
  throw new Error('no page in the header lists the releases')
}

test('the changelog lists every release, newest first, and each language has a feed with the same releases', async ({ page, request }) => {
  test.skip(!releases.length, 'no releases in the samples')
  const href = await changelogPage(page)
  // Wrong behaviour caught: a release missing, or the list in file order instead of newest first.
  expect(await page.locator('main [data-release]').evaluateAll((items) => items.map((item) => item.id)), 'releases on the page').toEqual(releases.map((r) => anchor(r.version)))
  // A one-language site has no language links: it checks its own feed.
  const alts = await page.locator('header a[hreflang]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))
  for (const alt of alts.length ? alts : [href]) {
    await open(page, alt)
    const ids = await page.locator('main [data-release]').evaluateAll((items) => items.map((item) => item.id))
    const feedPath = await page.locator('link[type="application/rss+xml"]').getAttribute('href')
    const response = await request.get(feedPath!)
    expect(response.status(), `${feedPath}`).toBe(200)
    expect(response.headers()['content-type']).toContain('application/rss+xml')
    const xml = await response.text()
    // Wrong behaviour caught: a feed of another language, or releases the page does not show.
    const items = [...xml.matchAll(/<guid isPermaLink="true">[^<#]+#([^<]+)<\/guid>/g)].map((m) => m[1])
    expect(items, `${feedPath} items`).toEqual(ids)
  }
})

test('the home page shows the newest release first', async ({ page }) => {
  test.skip(!releases.length, 'no releases in the samples')
  const changelog = await changelogPage(page)
  await open(page, '/')
  const links = page.locator(`main a[href^="${changelog}#"]`)
  test.skip(!(await links.count()), 'the home page has no latest changes')
  // Wrong behaviour caught: the oldest release (file order) shown as the latest change.
  await expect(links.first()).toHaveAttribute('href', `${changelog}#${anchor(releases[0]!.version)}`)
})
