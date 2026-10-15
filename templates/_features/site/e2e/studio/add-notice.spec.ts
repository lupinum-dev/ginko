// Gate 7 job (spec TEMPLATES.md §5, starter: "notice, rare"): the owner puts a notice on the site, and the home page
// shows it. Not synced into a template; run by `pnpm templates test <name> --platform`.
import { expect, test } from '@playwright/test'
import { studio } from '../../../../../scripts/templates/e2e/studio.ts'

// The template's names for this job, in one place. Adapt here when the brick or its fields change.
const NOTICE = {
  brick: 'notice', // key of the brick in ginko.config.ts
  textField: /^Text/, // label of the notice text (the Studio adds "(optional)")
}

test('the owner adds a notice and the home page shows it', async ({ page, request }) => {
  const text = `Gate seven notice ${Date.now()}`
  await page.goto(`/s/${studio.site}/all/${NOTICE.brick}`)
  await page.getByLabel(NOTICE.textField).fill(text)
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Gespeichert').first()).toBeVisible()

  await expect.poll(async () => (await request.get(`${studio.siteUrl}/`)).text(), { timeout: 60_000 }).toContain(text)
})
