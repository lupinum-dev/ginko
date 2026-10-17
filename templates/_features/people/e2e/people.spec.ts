// The people feature on the built template (gate 3): one Person in the JSON-LD per person shown, and no photo of a
// named person that is not in the content (initials stand in).
import { expect, open, sitePages, test } from '../../../../scripts/templates/e2e/helpers.ts'

test('the team page describes each person shown as a Person', async ({ page }) => {
  for (const path of await sitePages()) {
    await open(page, path)
    const people = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts) => scripts
      .map((s) => JSON.parse(s.textContent ?? '{}')).filter((node) => node['@type'] === 'Person').map((node) => node.name as string))
    if (!people.length) continue
    // Wrong behaviour caught: JSON-LD for people the page does not show, or a person shown without one.
    const shown = await page.locator('main li h2').allInnerTexts()
    expect(people).toEqual(shown.map((name) => name.trim()))
    return
  }
  throw new Error('no page with Person JSON-LD in the sitemap')
})
