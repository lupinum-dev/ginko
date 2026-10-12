// The sitemap of the restaurant site against the platform contract (SPEC 8 "Sitemap").
// The expected URL count comes from contracts/restaurant with the core's own visibility rule and
// today's date, so the test stays true as events pass (on 2026-10-08: 14 static pages + 4 event URLs).
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { isVisible, todayIn, type Bundle, type Schema } from '../packages/ginko/src/internal.ts'

const read = <T>(file: string): T => JSON.parse(readFileSync(new URL(`../contracts/restaurant/${file}`, import.meta.url), 'utf8')) as T
const schema = read<Schema>('schema.json')
const today = todayIn(schema.timezone)
const expectedUrls = schema.locales.reduce((n, locale) => {
  const bundle = read<Bundle>(`bundle.format3.${locale}.json`)
  const pages = Object.values(schema.pages).filter((paths) => paths[locale]).length
  const items = Object.entries(bundle.bricks).flatMap(([key, brick]) =>
    brick.kind === 'collection' ? brick.items.filter((i) => i.urls?.[locale] && isVisible(schema.bricks[key]!, i.data, today)) : [])
  return n + pages + items.length
}, 0)

const platform = 'http://localhost:3999'
const site = 'https://ginko-demo-restaurant.vercel.app'
test.afterEach(async ({ request }) => { await request.get(`${platform}/__control?mode=ok`) })

test('lists the static pages and the visible entries, with alternates', async ({ request }) => {
  const response = await request.get('/sitemap.xml')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('application/xml; charset=utf-8')
  expect(response.headers()['x-ginko-rev']).toMatch(/^\d+\.\d+$/)
  const xml = await response.text()
  expect(xml.match(/<url>/g)).toHaveLength(expectedUrls)
  expect(xml).not.toContain('sommerfest')
  // martinigans (2026-11-11) is visible until then; its alternates must link both locales.
  if (today <= '2026-11-11') {
    expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="de-AT" href="${site}/veranstaltungen/martini-gansl"/>`)
    expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="en-GB" href="${site}/en/events/martini-gansl"/>`)
  }
})

test('a platform failure is a 503, never an empty sitemap', async ({ request }) => {
  await request.get(`${platform}/__control?mode=503`)
  const response = await request.get('/sitemap.xml')
  expect(response.status()).toBe(503)
})
