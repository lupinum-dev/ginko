// The docs feature on the built template (gate 3): no broken internal link. Every page of the sitemap, in every
// language, is opened; each link on it to the same site (header, navigation, text, cards, footer, the language
// alternates in the head) must answer 200, and a link with `#anchor` must find that id on its page. A renamed or
// deleted page, a wrong `$docs.<page>` link or a moved heading fails here, not in front of a reader.
import { allPages, expect, open, site, test } from '../../../../scripts/templates/e2e/helpers.ts'

test('every internal link of every page answers 200 and finds its anchor', async ({ page, request }) => {
  test.setTimeout(600_000)
  const pages = await allPages()
  // Wrong behaviour caught: a sitemap without the pages of a language, so their links are never followed.
  for (const locale of site.locales.slice(1)) expect(pages.some((path) => path.startsWith(`/${locale}/`)), `sitemap pages in ${locale}`).toBe(true)
  const targets = new Map<string, string>() // link → first page that has it
  for (const path of pages) {
    await open(page, path)
    const hrefs = await page.evaluate(() => [
      ...[...document.querySelectorAll<HTMLAnchorElement>('a[href]')].map((a) => a.href),
      ...[...document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')].map((l) => l.href),
    ])
    for (const href of hrefs) {
      const url = new URL(href, site.url)
      if (url.origin !== new URL(site.url).origin && url.hostname !== 'example.com') continue
      // Canonical and alternate links carry the site's configured address (example.com in the sample); the path counts.
      const link = `${url.pathname}${url.hash}`
      if (!targets.has(link)) targets.set(link, path)
    }
  }
  const html = new Map<string, Promise<{ status: number; body: string }>>()
  const fetchPage = (path: string) => {
    if (!html.has(path)) html.set(path, request.get(path).then(async (r) => ({ status: r.status(), body: r.headers()['content-type']?.includes('html') ? await r.text() : '' })))
    return html.get(path)!
  }
  const broken: string[] = []
  for (const [link, from] of targets) {
    const [path, hash] = link.split('#') as [string, string | undefined]
    const { status, body } = await fetchPage(path)
    if (status !== 200) broken.push(`${from} → ${link}: ${status}`)
    else if (hash && body && !body.includes(`id="${decodeURIComponent(hash)}"`)) broken.push(`${from} → ${link}: no element with id "${hash}"`)
  }
  expect(broken, `broken links (${targets.size} checked)`).toEqual([])
})
