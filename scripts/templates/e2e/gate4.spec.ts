// Gate 4 (TEMPLATES.md §9): axe (WCAG 2.2 AA) in light and dark on home and every page; the keyboard path.
import AxeBuilder from '@axe-core/playwright'
import { expect, navToggle, open, sitePages, test, themeToggle } from './helpers.ts'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

for (const scheme of ['light', 'dark'] as const) {
  test(`axe finds no WCAG 2.2 AA violation in ${scheme} mode`, async ({ page }) => {
    test.setTimeout(600_000)
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    const found: string[] = []
    for (const path of await sitePages()) {
      await open(page, path)
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
      for (const v of violations) found.push(`${path} ${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}${v.id === 'color-contrast' ? ` — ${v.nodes[0]?.any[0]?.message ?? ''}` : ''}`)
    }
    expect(found, `axe violations, ${scheme}`).toEqual([])
  })
}

/** The focused element, and whether it shows a focus indicator (outline or box-shadow). */
const focused = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return undefined
  const style = getComputedStyle(el)
  const indicator = (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none'
  return { text: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40), tag: el.tagName, href: el.getAttribute('href'), inHeader: !!el.closest('header'), indicator }
})

for (const width of [390, 1440]) {
  test(`keyboard path at ${width}: skip link, header, nav sheet, theme toggle, accordion, lightbox`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await open(page, '/')
    await page.keyboard.press('Tab')
    const first = await focused(page)
    expect(first?.href, 'the first Tab stop is the skip link to the main content').toMatch(/^#/)
    expect.soft(first?.indicator, 'the skip link shows focus').toBe(true)
    // Every visible link and button of the header is reached by Tab, with a visible focus indicator.
    const header = await page.locator('header a:visible, header button:visible').count()
    const stops: NonNullable<Awaited<ReturnType<typeof focused>>>[] = []
    for (let i = 0; i < header + 5; i++) {
      await page.keyboard.press('Tab')
      const stop = await focused(page)
      if (stop?.inHeader) stops.push(stop)
    }
    expect(stops.length, 'header stops reached by Tab').toBeGreaterThanOrEqual(header)
    expect.soft(stops.filter((s) => !s.indicator).map((s) => s.text), 'header stops without a focus indicator').toEqual([])

    const toggle = navToggle(page)
    if (await toggle.isVisible()) {
      await toggle.focus()
      await page.keyboard.press('Enter')
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await page.keyboard.press('Escape')
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await expect(toggle, 'focus returns to the nav button').toBeFocused()
    }
    const theme = themeToggle(page)
    if (await theme.isVisible()) {
      await theme.focus()
      const before = await page.evaluate(() => document.documentElement.outerHTML.slice(0, 300))
      await page.keyboard.press('Enter')
      await expect.poll(() => page.evaluate(() => document.documentElement.outerHTML.slice(0, 300))).not.toBe(before)
    }
  })
}

test('accordions and lightboxes work with the keyboard on every page that has them', async ({ page }) => {
  for (const path of await sitePages()) {
    await open(page, path)
    const accordion = page.locator('main summary, main [aria-expanded][aria-controls]').first()
    if (await accordion.isVisible()) {
      await accordion.focus()
      await page.keyboard.press('Enter')
      // A <summary> opens its <details>; an ARIA trigger (reka's Accordion) says so in aria-expanded.
      if (await accordion.evaluate((el) => el.tagName === 'SUMMARY')) await expect.soft(accordion.locator('xpath=..'), `${path} accordion opens with Enter`).toHaveJSProperty('open', true)
      else await expect.soft(accordion, `${path} accordion opens with Enter`).toHaveAttribute('aria-expanded', 'true')
    }
    const lightbox = page.locator('main [aria-haspopup="dialog"]').first()
    if (await lightbox.isVisible()) {
      await lightbox.focus()
      await page.keyboard.press('Enter')
      await expect.soft(page.getByRole('dialog'), `${path} lightbox opens with Enter`).toBeVisible()
      await page.keyboard.press('Escape')
      await expect.soft(page.getByRole('dialog'), `${path} lightbox closes with Escape`).toBeHidden()
    }
  }
})
