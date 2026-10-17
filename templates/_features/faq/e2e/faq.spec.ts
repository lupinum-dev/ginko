// The FAQ feature on the built template (gate 3): the FAQPage JSON-LD of the FAQ page has one Question per accordion
// item, named like the visible question, and each question is an h2 (the page's outline).
import { expect, open, sitePages, test } from '../../../../scripts/templates/e2e/helpers.ts'

test('the FAQ page describes each visible question as a Question in one FAQPage', async ({ page }) => {
  for (const path of await sitePages()) {
    await open(page, path)
    // The FAQ page (page key `faq`) is the one with its closing contact line; its address comes from `pages.faq`.
    if (!(await page.locator('main [data-faq-contact]').count())) continue
    const shown = (await page.locator('main h2').allInnerTexts()).map((text) => text.trim())
    expect(shown.length, 'a question per accordion item').toBeGreaterThan(0)
    // Wrong behaviour caught: FAQPage JSON-LD missing, doubled, or out of step with the visible questions.
    const pages = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts) => scripts
      .flatMap((s) => { const data = JSON.parse(s.textContent ?? '{}'); return Array.isArray(data) ? data : data['@graph'] ?? [data] })
      .filter((node) => node['@type'] === 'FAQPage'))
    expect(pages, 'one FAQPage').toHaveLength(1)
    const questions = (pages[0].mainEntity as { '@type': string, name: string }[])
    expect(questions.every((q) => q['@type'] === 'Question')).toBe(true)
    expect(questions.map((q) => q.name.trim())).toEqual(shown)
    return
  }
  throw new Error('no FAQ page in the sitemap')
})
