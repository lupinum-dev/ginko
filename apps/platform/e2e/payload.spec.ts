// Page weight (Nuxt payload): platform texts are `{ ref }` in page state, so a page carries only the texts it shows.
// Runs against the local restaurant site (platform source), seeded from contracts/restaurant/data.json.
import { expect, test } from '@playwright/test'
import { resetContent } from './local'

const SITE = 'http://localhost:3000'

test.beforeEach(() => resetContent())

test('a page payload holds only the texts it shows, and a client navigation loads the rest', async ({ page, request }) => {
  // The home page does not show the imprint: its payload must not carry that text.
  const html = await (await request.get(`${SITE}/`)).text()
  const payload = /<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1]
  expect(payload).toBeTruthy()
  expect(payload).not.toContain('Inhaberin: Maria Ebner')

  // A client navigation to the imprint loads that one text from the site's platform text route.
  // Wait for hydration first: a click before it is a full page load, whose server render carries the text itself.
  await page.goto(`${SITE}/`)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  const text = page.waitForResponse((response) => /\/__ginko\/platform\/de\/\d+\.\d+\/md\/legal\/legal\/imprint\.json$/.test(new URL(response.url()).pathname) && response.ok())
  await page.getByRole('contentinfo').getByRole('link', { name: 'Impressum' }).click()
  await text
  await expect(page.getByText('Inhaberin: Maria Ebner (Einzelunternehmen)')).toBeVisible()
})
