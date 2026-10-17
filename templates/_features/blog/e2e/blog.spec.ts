// The blog feature on the built template (gate 3): drafts and scheduled posts never go online, the feed of each
// language lists the posts of its news page, a tag has a page with its posts and JSON-LD, a post shows its reading
// time and links its author's page with that author's posts, and a post links the older one. Tag pages stay out of the
// sitemap and llms.txt on purpose: thin archives, reached through the rel="tag" links of the posts.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, open, site, test } from '../../../../scripts/templates/e2e/helpers.ts'

const dir = fileURLToPath(new URL(`../../../${site.name}/content/posts/`, import.meta.url))
/** The main-language post files (no language suffix): their text and slug (the `slug` line, else the file name). */
const files = existsSync(dir)
  ? readdirSync(dir).filter((file) => /^[^.]+(\.[^.]+)?\.md$/.test(file) && !/\.[a-z]{2}(-[A-Z]{2})?\.md$/.test(file)).map((file) => {
      const text = readFileSync(`${dir}${file}`, 'utf8')
      return { text, slug: /^slug:\s*(\S+)/m.exec(text)?.[1] ?? file.replace(/\.md$/, '').replace(/^\d+\./, '') }
    })
  : []
const today = site.now.slice(0, 10)
/** Drafts (`draft: true`) and scheduled posts (dated after the test day): neither may be online. */
const hidden = files.filter(({ text }) => /^draft:\s*true\s*$/m.test(text) || (/^date:\s*(\S+)/m.exec(text)?.[1] ?? '') > today)

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

test('a draft or scheduled post has no page and is in no list, feed, sitemap or llms.txt', async ({ page, request }) => {
  // Wrong behaviour caught: an unchecked text, or a post before its day, online because the build kept it.
  test.skip(hidden.length === 0, 'the template has no draft or scheduled sample')
  const news = await newsPage(page)
  const feed = await (await request.get(`${news}/rss.xml`)).text()
  const sitemap = await (await request.get('/sitemap.xml')).text()
  const llms = await (await request.get('/llms.txt')).text()
  for (const { slug } of hidden) {
    expect((await request.get(`${news}/${slug}`)).status(), `post ${slug}`).toBe(404)
    expect(feed, `feed without ${slug}`).not.toContain(`/${slug}<`)
    expect(sitemap, `sitemap without ${slug}`).not.toContain(`/${slug}<`)
    expect(llms, `llms.txt without ${slug}`).not.toMatch(new RegExp(`/${slug}(\\.md)?\\)`))
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

test('a tag on a post leads to its own page with the posts that carry it', async ({ page }) => {
  await newsPage(page)
  const post = page.locator('main li :is(h2, h3) a').first()
  await open(page, (await post.getAttribute('href'))!)
  // Wrong behaviour caught: a post header without its reading time.
  expect(await page.locator('article header p').first().innerText(), 'reading time next to the date').toMatch(/\d/)
  const tag = page.locator('main a[rel="tag"]').first()
  test.skip(!(await tag.count()), 'the newest post has no tag')
  const name = (await tag.textContent())!.trim()
  const href = (await tag.getAttribute('href'))!
  // Wrong behaviour caught: a tag link to a filter of the list or a missing page, or a tag page with other posts.
  expect(href, 'a tag has its own address').not.toContain('?')
  expect((await open(page, href))?.status(), href).toBe(200)
  await expect(page.locator('h1')).toContainText(name)
  const types = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts) => scripts.flatMap((script) => {
    try { return [JSON.parse(script.textContent ?? '')['@type']] } catch { return [] }
  }))
  expect(types.filter(Boolean), 'the tag page has JSON-LD with a type').not.toHaveLength(0)
  const listed = page.locator('main li :is(h2, h3) a')
  expect(await listed.count(), 'posts with the tag').toBeGreaterThan(0)
  for (const link of await listed.evaluateAll((as) => as.map((a) => a.getAttribute('href')!))) {
    await open(page, link)
    await expect(page.locator('main a[rel="tag"]').filter({ hasText: name }), `${link} carries ${name}`).not.toHaveCount(0)
  }
})

test('a post links the next older post of the list', async ({ page }) => {
  await newsPage(page)
  const posts = await page.locator('main li :is(h2, h3) a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))
  test.skip(posts.length < 2, 'fewer than two posts')
  // Wrong behaviour caught: older and newer swapped, or a link to a post the list does not show.
  await open(page, posts[0]!)
  await expect(page.locator('main a[rel="prev"]')).toHaveAttribute('href', posts[1]!)
  await expect(page.locator('main a[rel="next"]')).toHaveCount(0)
})

test('the author of a post has a page that lists that author\'s posts', async ({ page }) => {
  await newsPage(page)
  await open(page, (await page.locator('main li :is(h2, h3) a').first().getAttribute('href'))!)
  const author = page.locator('main ul[aria-label] li a').first()
  test.skip(!(await author.count()), 'the newest post has no linked author')
  const name = (await author.textContent())!.trim()
  const href = (await author.getAttribute('href'))!
  // Wrong behaviour caught: a byline link to the wrong or a missing page, or an author page with other people's posts.
  expect((await open(page, href))?.status(), href).toBe(200)
  await expect(page.locator('h1')).toHaveText(name)
  const listed = await page.locator('main li :is(h2, h3) a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))
  expect(listed.length, 'posts by the author').toBeGreaterThan(0)
  for (const link of listed) {
    await open(page, link)
    await expect(page.locator('main ul[aria-label] li a').filter({ hasText: name }), `${link} is by ${name}`).not.toHaveCount(0)
  }
})
