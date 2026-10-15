// The projects feature on the built template (gate 3): a campaign shows its last day on its card and its page.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, open, site, test } from '../../../../scripts/templates/e2e/helpers.ts'

const dir = fileURLToPath(new URL(`../../../${site.name}/content/projects/`, import.meta.url))
/** Main-language campaigns still running at the test instant: their slug. */
const campaigns = existsSync(dir)
  ? readdirSync(dir).filter((file) => /^\d+\.[^.]+\.md$/.test(file)).map((file) => readFileSync(`${dir}${file}`, 'utf8'))
    .filter((text) => (/^ends:\s*(\S+)/m.exec(text)?.[1] ?? '') >= site.now.slice(0, 10)).map((text) => /^slug:\s*(\S+)/m.exec(text)![1]!)
  : []

test('a running campaign shows when it ends, on its card and on its page', async ({ page }) => {
  test.skip(!campaigns.length, 'no running campaign in the samples')
  // The projects page: the header link whose page links to the campaigns.
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, '/')
  for (const href of await page.locator('header nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))) {
    await open(page, href)
    if (await page.locator(`main a[href$="/${campaigns[0]}"]`).count()) break
  }
  for (const slug of campaigns) {
    const card = page.locator('main li').filter({ has: page.locator(`a[href$="/${slug}"]`) })
    // Wrong behaviour caught: a donation campaign that does not say until when it runs.
    await expect(card.locator('p').first(), `${slug} card`).toContainText(/\d/)
    await open(page, (await card.locator('a').first().getAttribute('href'))!)
    await expect(page.locator('main header p').last(), `${slug} page`).toContainText(/\d/)
    await page.goBack()
  }
})
