// A right-to-left language on the built template (gate 3, TEMPLATES T8): only for a template with one (nonprofit: ar).
// Order and side of the header, the nav sheet from the start (the right), mirrored arrows, the Arabic face on the
// page, and a share card that renders.
import { expect, navToggle, open, site, test } from '../../../../scripts/templates/e2e/helpers.ts'

const RTL = ['ar', 'fa', 'he', 'ur']
const rtl = site.locales.find((code, i) => i > 0 && RTL.includes(code.split('-')[0]!))
const home = `/${rtl}`

test.describe('right to left', () => {
  test.skip(!rtl, 'no right-to-left language besides the main one')

  test('the page is rtl: the name at the right, the menu at the left, arrows mirrored', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, home)
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    const name = await page.locator('header a').first().boundingBox()
    const nav = await page.locator('header nav').first().boundingBox()
    // Wrong behaviour caught: physical margins (ml-auto) that keep the header in left-to-right order.
    expect(name!.x, 'the site name is right of the navigation').toBeGreaterThan(nav!.x + nav!.width)
    const arrows = page.locator('main svg.lucide-arrow-right')
    const count = await arrows.count()
    expect(count, 'arrows on the page').toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      // A mirrored arrow points left: its `scale` (Tailwind's -scale-x-100) or transform flips the x axis.
      const flip = await arrows.nth(i).evaluate((svg) => { const style = getComputedStyle(svg); return `${style.scale} ${style.transform}` })
      expect(flip, `arrow ${i} is mirrored`).toMatch(/^-1 |matrix\(-1,/)
    }
  })

  test('the nav sheet opens from the right on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page, home)
    const sheet = page.getByRole('dialog')
    // A click before the page is interactive opens nothing; click until the sheet shows.
    await expect(async () => {
      await navToggle(page).click()
      await expect(sheet).toBeVisible({ timeout: 1000 })
    }).toPass()
    // The sheet slides in; wait until it rests, then it touches the right edge.
    await expect.poll(async () => { const box = await sheet.boundingBox(); return box && Math.round(box.x + box.width) }).toBe(390)
  })

  test('text is set in the Arabic face, and the share card of the page renders', async ({ page, request }) => {
    await open(page, home)
    const face = await page.locator('h1').evaluate((h1) => getComputedStyle(h1).fontFamily)
    expect(face, 'the heading font').toMatch(/^"?Noto Sans Arabic/)
    // Wrong behaviour caught: a font-face that never loads (the system's Arabic font would stand in silently).
    const loaded = await page.evaluate(async () => (await document.fonts.load('16px "Noto Sans Arabic"', 'نهر')).length)
    expect(loaded, 'faces of Noto Sans Arabic loaded for Arabic text').toBeGreaterThan(0)
    const card = await page.locator('meta[property="og:image"]').getAttribute('content')
    expect(card, 'og:image').toBeTruthy()
    const response = await request.get(new URL(card!).pathname + new URL(card!).search)
    expect(response.status(), 'share card').toBe(200)
    expect(response.headers()['content-type']).toContain('image/png')
  })
})
