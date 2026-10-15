// The projects feature on the built template (gate 3): a campaign shows its last day on its card and its page, and
// leaves the site after that day.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, open, site, sitePages, test } from '../../../../scripts/templates/e2e/helpers.ts'

const dir = fileURLToPath(new URL(`../../../${site.name}/content/projects/`, import.meta.url))
/** Main-language projects: their slug and, for a campaign, its last day. */
const projects = existsSync(dir)
  ? readdirSync(dir).filter((file) => /^\d+\.[^.]+\.md$/.test(file)).map((file) => readFileSync(`${dir}${file}`, 'utf8'))
    .map((text) => ({ slug: /^slug:\s*(\S+)/m.exec(text)![1]!, ends: /^ends:\s*(\S+)/m.exec(text)?.[1] }))
  : []
const today = site.now.slice(0, 10)
/** Campaigns still running at the test instant, and campaigns whose last day is before it. */
const campaigns = projects.filter((p) => p.ends && p.ends >= today).map((p) => p.slug)
const ended = projects.filter((p) => p.ends && p.ends < today).map((p) => p.slug)

test('a campaign whose last day has passed has no card, no page and no sitemap entry', async ({ page }) => {
  test.skip(!ended.length, 'no ended campaign in the samples')
  // The projects page in the main language: the header link whose page has project cards.
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, '/')
  let base = ''
  for (const href of await page.locator('header nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))) {
    await open(page, href)
    const card = page.locator(projects.filter((p) => !ended.includes(p.slug)).map((p) => `main li a[href$="/${p.slug}"]`).join(', ')).first()
    if (await card.count()) {
      base = (await card.getAttribute('href'))!.replace(/\/[^/]+$/, '')
      break
    }
  }
  expect(base, 'the projects page with cards').not.toBe('')
  const sitemap = await sitePages()
  for (const slug of ended) {
    // Wrong behaviour caught: a donation campaign still asking for money after it ended.
    await expect(page.locator(`main a[href$="/${slug}"]`), `${slug} card`).toHaveCount(0)
    expect((await page.request.get(`${base}/${slug}`)).status(), `${slug} page`).toBe(404)
    expect(sitemap.filter((path) => path.endsWith(`/${slug}`)), `${slug} in the sitemap`).toEqual([])
  }
})

test('a running campaign shows when it ends, on its card and on its page', async ({ page }) => {
  test.skip(!campaigns.length, 'no running campaign in the samples')
  // The projects page: the header link whose page links to the campaigns.
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, '/')
  for (const href of await page.locator('header nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))) {
    await open(page, href)
    if (await page.locator(`main a[href$="/${campaigns[0]}"]`).count()) break
  }
  for (const slug of campaigns) {
    const card = page.locator('main li').filter({ has: page.locator(`a[href$="/${slug}"]`) })
    // Wrong behaviour caught: a donation campaign that does not say until when it runs.
    await expect(card.locator('p').first(), `${slug} card`).toContainText(/\d/)
    await open(page, (await card.locator('a').first().getAttribute('href'))!)
    await expect(page.locator('main header p').last(), `${slug} page`).toContainText(/\d/)
    await page.goBack()
  }
})
