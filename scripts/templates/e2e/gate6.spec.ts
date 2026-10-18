// Gate 6 (TEMPLATES.md §9): budgets in Chromium at 390 on the built server: gzip(script bodies) ≤ 150 kB (a feature
// template's `ginko.scriptBudget` in package.json, at most 170), the LCP
// resource ≤ 200 kB, CLS ≤ 0.1 until load + 1 s; CLS also at 768 and 1024 on every page of the sitemap
// (text that re-wraps when the web font arrives shifts more on wider lines). No Lighthouse.
import { gzipSync } from 'node:zlib'
import { allPages, expect, site, sitePages, test } from './helpers.ts'

const KB = 1024
const BUDGET = { scripts: Number(process.env.TEMPLATE_SCRIPT_BUDGET ?? 150) * KB, lcp: 200 * KB, cls: 0.1 }

/** Sums the page's layout shifts (not after input) into `window.__cls` from the first paint on. */
function countShifts() {
  const w = window as unknown as { __cls: number }
  w.__cls = 0
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!entry.hadRecentInput) w.__cls += entry.value
  }).observe({ type: 'layout-shift', buffered: true })
}

test('budgets on a sample of every route pattern at 390', async ({ browser }) => {
  test.setTimeout(600_000)
  for (const path of await sitePages()) {
    // A fresh context per page: nothing comes from the cache.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    // The fixture's clock is on the default page only; this page gets the same test instant (T10).
    await page.clock.install({ time: new Date(site.now) })
    await page.addInitScript(countShifts)
    await page.addInitScript(() => {
      const w = window as unknown as { __lcp?: { url: string; size: number } }
      new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1) as (PerformanceEntry & { url: string; size: number }) | undefined
        if (last) w.__lcp = { url: last.url, size: last.size }
      }).observe({ type: 'largest-contentful-paint', buffered: true })
    })
    const scripts: Promise<number>[] = []
    page.on('response', (response) => {
      if (response.request().resourceType() === 'script') scripts.push(response.body().then((body) => gzipSync(body).length, () => 0))
    })
    await page.goto(path, { waitUntil: 'load' })
    await page.waitForTimeout(1000)
    const { cls, lcp } = await page.evaluate(() => {
      const w = window as unknown as { __cls: number; __lcp?: { url: string } }
      const url = w.__lcp?.url
      const resource = url ? (performance.getEntriesByName(url)[0] as PerformanceResourceTiming | undefined) : undefined
      return { cls: w.__cls, lcp: { url: url || '(text)', bytes: resource ? resource.encodedBodySize || resource.transferSize : 0 } }
    })
    const scriptBytes = (await Promise.all(scripts)).reduce((a, b) => a + b, 0)
    expect.soft(scriptBytes, `${path}: gzip(script bodies) in bytes (budget ${BUDGET.scripts})`).toBeLessThanOrEqual(BUDGET.scripts)
    expect.soft(lcp.bytes, `${path}: LCP resource ${lcp.url} in bytes (budget ${BUDGET.lcp})`).toBeLessThanOrEqual(BUDGET.lcp)
    expect.soft(cls, `${path}: CLS until load + 1 s (budget ${BUDGET.cls})`).toBeLessThanOrEqual(BUDGET.cls)
    console.log(`${path}: scripts ${(scriptBytes / KB).toFixed(1)} kB gzip, LCP ${lcp.url} ${(lcp.bytes / KB).toFixed(1)} kB, CLS ${cls.toFixed(3)}`)
    await context.close()
  }
})

test('CLS at 768 and 1024 on every page', async ({ browser }) => {
  test.setTimeout(900_000)
  for (const width of [768, 1024]) {
    for (const path of await allPages()) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      const page = await context.newPage()
      await page.clock.install({ time: new Date(site.now) })
      await page.addInitScript(countShifts)
      await page.goto(path, { waitUntil: 'load' })
      await page.waitForTimeout(1000)
      const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls)
      // Wrong behaviour caught: German paragraphs that re-wrap when Inter replaces its fallback (a ch-based width).
      expect.soft(cls, `${path} at ${width}: CLS until load + 1 s (budget ${BUDGET.cls})`).toBeLessThanOrEqual(BUDGET.cls)
      if (cls > 0.05) console.log(`${path} at ${width}: CLS ${cls.toFixed(3)}`)
      await context.close()
    }
  }
})
