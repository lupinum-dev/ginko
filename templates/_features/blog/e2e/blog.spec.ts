// The blog feature on the built template (gate 3): drafts never go online, the feed of each language lists the posts
// of its news page, and a tag shows only its posts.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, open, site, test } from '../../../../scripts/templates/e2e/helpers.ts'

const dir = fileURLToPath(new URL(`../../../${site.name}/content/posts/`, import.meta.url))
/** Slugs of the main-language posts marked `draft: true`. */
const drafts = existsSync(dir)
  ? readdirSync(dir).filter((file) => /^[^.]+\.md$/.test(file)).map((file) => readFileSync(`${dir}${file}`, 'utf8'))
    .filter((text) => /^draft:\s*true\s*$/m.test(text)).map((text) => /^slug:\s*(\S+)/m.exec(text)?.[1]).filter(Boolean)
  : []

/** The news page of the main language: the first link of the header that leads to a page with a feed. */
async function newsPage(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, '/')
  for (const href of await page.locator('header nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))) {
    await open(page, href)
    if (await page.locator('link[type="application/rss+xml"]').count()) return href
  }
  throw new Error('no page in the header links a news feed')
}

test('a draft post has no page and is in no list or feed', async ({ page, request }) => {
  // Wrong behaviour caught: a volunteer's unchecked text online because the build kept files marked as drafts.
  test.skip(drafts.length === 0, 'the template has no draft sample')
  const news = await newsPage(page)
  const feed = await (await request.get(`${news}/rss.xml`)).text()
  for (const slug of drafts) {
    expect((await request.get(`${news}/${slug}`)).status(), `draft ${slug}`).toBe(404)
    expect(feed, `feed without ${slug}`).not.toContain(`/${slug}<`)
    await expect(page.locator(`main a[href$="/${slug}"]`), `news list without ${slug}`).toHaveCount(0)
  }
})

test('each language has a feed with the posts of its news page', async ({ page, request }) => {
  const news = await newsPage(page)
  for (const alt of await page.locator('header a[hreflang]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))) {
    await open(page, alt)
    const feedPath = await page.locator('link[type="application/rss+xml"]').getAttribute('href')
    const response = await request.get(feedPath!)
    expect(response.status(), `${feedPath}`).toBe(200)
    expect(response.headers()['content-type']).toContain('application/rss+xml')
    const xml = await response.text()
    const listed = await page.locator('main li h2 a, main li h3 a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))
    // Wrong behaviour caught: a feed that lists other posts than the page (another language, hidden or draft posts).
    expect([...xml.matchAll(/<link>https?:\/\/[^/]+([^<]+)<\/link>/g)].map((m) => m[1]).slice(1), `${feedPath} items`).toEqual(listed)
  }
  expect(news).toBeTruthy()
})

test('a tag on a post leads to the list of its posts', async ({ page }) => {
  await newsPage(page)
  const post = page.locator('main li h2 a').first()
  await open(page, (await post.getAttribute('href'))!)
  const tag = page.locator('main a[href*="tag="]').first()
  test.skip(!(await tag.count()), 'the newest post has no tag')
  const name = (await tag.textContent())!.trim()
  await Promise.all([page.waitForURL(/[?&]tag=/), tag.click()])
  await expect(page.locator('main p').filter({ hasText: name }).first()).toBeVisible()
  expect(await page.locator('main li h2 a').count(), 'posts with the tag').toBeGreaterThan(0)
})
