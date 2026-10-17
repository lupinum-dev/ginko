// The downloads feature on the built template (gate 3): every listed file opens directly.
import { expect, open, sitePages, test } from '../../../../scripts/templates/e2e/helpers.ts'

test('each document of the downloads page answers 200 with its file type', async ({ page, request }) => {
  // The downloads page: the one in the sitemap whose main list links to files (.pdf).
  let checked = 0
  for (const path of await sitePages()) {
    await open(page, path)
    const files = await page.locator('main li h2 a[href$=".pdf"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))
    for (const file of files) {
      const response = await request.get(file)
      // Wrong behaviour caught: a list entry whose file is missing from public/ (a 404 for the visitor).
      expect.soft(response.status(), file).toBe(200)
      expect.soft(response.headers()['content-type'], file).toContain('application/pdf')
      checked++
    }
    if (checked) break
  }
  expect(checked, 'documents checked').toBeGreaterThan(0)
})
