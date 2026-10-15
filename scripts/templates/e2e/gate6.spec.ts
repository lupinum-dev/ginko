// Gate 6 (TEMPLATES.md §9): budgets in Chromium at 390 on the built server: gzip(script bodies) ≤ 150 kB, the LCP
// resource ≤ 200 kB, CLS ≤ 0.1 until load + 1 s. No Lighthouse.
import { gzipSync } from 'node:zlib'
import { expect, sitePages, test } from './helpers.ts'

const KB = 1024
const BUDGET = { scripts: 150 * KB, lcp: 200 * KB, cls: 0.1 }

test('budgets on every page at 390', async ({ browser }) => {
  test.setTimeout(600_000)
  for (const path of await sitePages()) {
    // A fresh context per page: nothing comes from the cache.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number; __lcp?: { url: string; size: number } }
      w.__cls = 0
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!entry.hadRecentInput) w.__cls += entry.value
      }).observe({ type: 'layout-shift', buffered: true })
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
      return { cls: w.__cls, lcp: { url: url ?? '(text)', bytes: resource ? resource.encodedBodySize || resource.transferSize : 0 } }
    })
    const scriptBytes = (await Promise.all(scripts)).reduce((a, b) => a + b, 0)
    expect.soft(scriptBytes, `${path}: gzip(script bodies) in bytes (budget ${BUDGET.scripts})`).toBeLessThanOrEqual(BUDGET.scripts)
    expect.soft(lcp.bytes, `${path}: LCP resource ${lcp.url} in bytes (budget ${BUDGET.lcp})`).toBeLessThanOrEqual(BUDGET.lcp)
    expect.soft(cls, `${path}: CLS until load + 1 s (budget ${BUDGET.cls})`).toBeLessThanOrEqual(BUDGET.cls)
    console.log(`${path}: scripts ${(scriptBytes / KB).toFixed(1)} kB gzip, LCP ${lcp.url} ${(lcp.bytes / KB).toFixed(1)} kB, CLS ${cls.toFixed(3)}`)
    await context.close()
  }
})
