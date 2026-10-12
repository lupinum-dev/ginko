// The printable lunch week (A4 sheet for the door) of the restaurant site. Build first: pnpm --filter './sites/*' build
import { expect, test } from '@playwright/test'

const evidence = 'test-results/lunch-print'

// Wrong behaviour caught: the door sheet prints with site navigation or a button, loses a day or the allergen key,
// or is indexed by search engines.
for (const [path, title, key, button, back] of [
  ['/mittagsmenue/drucken', 'Mittagsmenü', 'Allergene', 'Drucken', 'Zurück zum Mittagsmenü'],
  ['/en/lunch/print', 'Lunch menu', 'Allergens', 'Print', 'Back to the lunch menu'],
] as const) {
  test(`the lunch print page ${path} is one clean A4 sheet`, async ({ page }, info) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expect(page.locator('[data-test=print-week]')).toContainText(/\d{4}/)
    await expect(page.locator('[data-test=print-day]')).toHaveCount(5)
    await expect(page.getByRole('heading', { name: key })).toBeVisible()
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/)
    await expect(page.getByRole('button', { name: button })).toBeVisible()
    await expect(page.getByRole('navigation')).toHaveCount(0)
    const slug = path.replaceAll('/', '_')
    if (info.project.name === 'desktop') await page.screenshot({ path: `${evidence}/screen${slug}.png`, fullPage: true })

    await page.emulateMedia({ media: 'print' })
    await expect(page.getByRole('button', { name: button })).toBeHidden()
    await expect(page.getByRole('link', { name: back })).toBeHidden()
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)')
    if (info.project.name === 'desktop') {
      await page.screenshot({ path: `${evidence}/print${slug}.png`, fullPage: true })
      await page.pdf({ path: `${evidence}/print${slug}.pdf`, preferCSSPageSize: true })
    }
  })
}

// Wrong behaviour caught: the owner cannot find the print page from the lunch page, or the link is printed too.
test('the lunch page links to the print page, and the link is not printed', async ({ page }) => {
  await page.goto('/mittagsmenue')
  const link = page.getByRole('link', { name: 'Zum Ausdrucken' })
  await expect(link).toHaveAttribute('href', '/mittagsmenue/drucken')
  await page.emulateMedia({ media: 'print' })
  await expect(link).toBeHidden()
})
