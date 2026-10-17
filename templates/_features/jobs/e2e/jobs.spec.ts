// The jobs feature on the built template (gate 3): a job after its `validUntil` day is in no list, has no page, no
// sitemap entry and no JobPosting; every open job's page has a JobPosting with that day as `validThrough` and a way to
// apply that names the job.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, open, site, test } from '../../../../scripts/templates/e2e/helpers.ts'

const dir = fileURLToPath(new URL(`../../../${site.name}/content/jobs/`, import.meta.url))
/** Main-language jobs: slug, title and last day. */
const jobs = existsSync(dir)
  ? readdirSync(dir).filter((file) => /^[^.]+\.md$/.test(file)).map((file) => readFileSync(`${dir}${file}`, 'utf8'))
    .map((text) => ({ slug: /^slug:\s*(\S+)/m.exec(text)![1]!, title: /^title:\s*"?(.+?)"?\s*$/m.exec(text)![1]!, validUntil: /^validUntil:\s*(\S+)/m.exec(text)![1]! }))
  : []
const today = site.now.slice(0, 10)
const open_ = jobs.filter((job) => job.validUntil >= today)
const expired = jobs.filter((job) => job.validUntil < today)

/** Every path of the sitemap (all of it: the shared helper stops at 40 pages). */
async function sitemapPaths(): Promise<string[]> {
  const paths: string[] = []
  const read = async (url: string): Promise<void> => {
    const xml = await (await fetch(url)).text()
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!.replaceAll('&amp;', '&')).pathname)
    if (xml.includes('<sitemapindex')) for (const loc of locs) await read(`${site.url}${loc}`)
    else paths.push(...locs)
  }
  await read(`${site.url}/sitemap.xml`)
  return paths
}

/** The JobPosting nodes of the page's JSON-LD. */
const postings = (page: import('@playwright/test').Page) => page.locator('script[type="application/ld+json"]').evaluateAll((scripts) => scripts
  .flatMap((script) => {
    const data = JSON.parse(script.textContent ?? '{}')
    return Array.isArray(data) ? data : data['@graph'] ?? [data]
  }).filter((node) => node['@type'] === 'JobPosting'))

/** The jobs page of the main language: the header link whose page lists the first open job (or the jobs of the sitemap). */
async function jobsPage(page: import('@playwright/test').Page, sitemap: string[]): Promise<string> {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, '/')
  const hrefs = await page.locator('header nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))
  for (const href of hrefs) {
    await open(page, href)
    if (open_.length && await page.locator(`main li a[href$="/${open_[0]!.slug}"]`).count()) return href
  }
  // No open job: the header link whose address is the start of a job page's address in the sitemap, else none.
  return hrefs.find((href) => sitemap.some((path) => path.startsWith(`${href}/`))) ?? ''
}

test('a job after its last day is in no list, has no page, no sitemap entry and no JobPosting', async ({ page }) => {
  test.skip(!expired.length, 'no expired job in the samples')
  const sitemap = await sitemapPaths()
  const list = await jobsPage(page, sitemap)
  expect(list, 'the jobs page in the header').not.toBe('')
  await open(page, list)
  for (const job of expired) {
    // Wrong behaviour caught: an expired job ad still online, in search engines or in the list.
    await expect.soft(page.locator(`main a[href$="/${job.slug}"]`), `${job.slug} in the list`).toHaveCount(0)
    expect.soft((await page.request.get(`${list}/${job.slug}`)).status(), `${job.slug} page`).toBe(404)
    expect.soft(sitemap.filter((path) => path.endsWith(`/${job.slug}`)), `${job.slug} in the sitemap`).toEqual([])
  }
  for (const path of ['/', list]) {
    await open(page, path)
    const titles = (await postings(page)).map((node) => node.title)
    expect.soft(titles.filter((title) => expired.some((job) => job.title === title)), `expired jobs in the JSON-LD of ${path}`).toEqual([])
  }
})

test('each open job has a JobPosting with its last day and a way to apply that names it', async ({ page }) => {
  test.skip(!open_.length, 'no open job in the samples')
  const sitemap = await sitemapPaths()
  for (const job of open_) {
    const path = sitemap.find((p) => p.endsWith(`/${job.slug}`))
    expect.soft(path, `${job.slug} in the sitemap`).toBeTruthy()
    if (!path) continue
    expect((await open(page, path))?.status(), `${path} status`).toBe(200)
    const [posting] = await postings(page)
    // Wrong behaviour caught: a job ad that search engines keep after its deadline (no or a wrong validThrough).
    expect.soft(posting?.validThrough, `${path} validThrough`).toBe(job.validUntil)
    expect.soft(posting?.hiringOrganization?.name, `${path} employer`).toBeTruthy()
    // Wrong behaviour caught: an application email that does not say which job it is for.
    const apply = await page.locator('main a[href^="mailto:"], main header a[href^="http"]').first().getAttribute('href')
    if (apply?.startsWith('mailto:')) expect.soft(decodeURIComponent(new URL(apply).searchParams.get('subject') ?? ''), `${path} subject`).toContain(job.title)
    else expect.soft(apply, `${path} apply link`).toBeTruthy()
  }
})
