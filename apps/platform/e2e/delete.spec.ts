// Deletion (GDPR): a person deletes their own account, and an owner starts and cancels the deletion of the site.
// The account is a throwaway one, invited for this test, so the owner and the cook of the other tests stay.
import { expect, test } from '@playwright/test'
import { newestMail } from '../../../scripts/outbox.ts'
import { STATE } from './global-setup'
import { assertLocal, signIn } from './local'

test.beforeAll(() => assertLocal())

test('a person deletes their account and is signed out; the owner no longer sees them in the team', async ({ browser, baseURL }, testInfo) => {
  const email = `weg-${testInfo.project.name}-${Date.now().toString(36)}@example.test`
  const owner = await browser.newContext({ baseURL, locale: 'de-DE', storageState: STATE.owner })
  const ownerPage = await owner.newPage()
  await ownerPage.goto('/s/restaurant/team', { waitUntil: 'networkidle' })
  await ownerPage.getByRole('button', { name: 'Einladen' }).click()
  await ownerPage.getByLabel('E-Mail-Adresse').fill(email)
  await ownerPage.getByRole('button', { name: 'Einladung senden' }).click()
  await expect(ownerPage.getByText(email, { exact: true })).toBeVisible()

  const link = newestMail(email)?.text.match(/https?:\/\/\S+\/invite\/[\w-]+/)?.[0]
  expect(link, 'invite mail with a link').toBeTruthy()
  const guest = await browser.newContext({ baseURL, locale: 'de-DE' })
  const page = await guest.newPage()
  await page.goto(new URL(link!).pathname, { waitUntil: 'networkidle' })
  await signIn(page, email)
  await page.goto(new URL(link!).pathname, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Einladung annehmen' }).click()
  await page.waitForURL(/\/s\/restaurant/, { timeout: 30_000 })

  await page.goto('/account', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Konto löschen' })).toBeVisible()
  await page.getByRole('button', { name: 'Mein Konto löschen' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Mein Konto löschen' }).click()
  await page.waitForURL(/\/login/, { timeout: 30_000 })

  // The membership is gone.
  await ownerPage.reload({ waitUntil: 'networkidle' })
  await expect(ownerPage.getByRole('heading', { name: 'Mitglieder' })).toBeVisible()
  await expect(ownerPage.getByText(email, { exact: true })).toHaveCount(0)
  await owner.close()
  await guest.close()
})

test('an owner starts the deletion of the site, everyone is shut out, and cancelling brings it back', async ({ browser, baseURL }) => {
  const owner = await browser.newContext({ baseURL, locale: 'de-DE', storageState: STATE.owner })
  const cook = await browser.newContext({ baseURL, locale: 'de-DE', storageState: STATE.cook })
  const page = await owner.newPage()
  try {
    await page.goto('/s/restaurant/team', { waitUntil: 'networkidle' })
    const start = page.getByRole('button', { name: 'Seite löschen' })
    await expect(page.getByRole('heading', { name: 'Seite löschen' })).toBeVisible()
    await expect(start).toBeDisabled()
    await page.getByLabel('Zur Bestätigung restaurant eingeben').fill('restaurant')
    await start.click()
    await expect(page.getByText(/wird am .* gelöscht\./)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('link', { name: 'Heute' })).toHaveCount(0)

    const cookPage = await cook.newPage()
    await cookPage.goto('/s/restaurant', { waitUntil: 'networkidle' })
    await expect(cookPage.getByText('Kein Zugriff auf diese Seite.')).toBeVisible()

    await page.getByRole('button', { name: 'Löschung abbrechen' }).click()
    await expect(page.getByRole('heading', { name: 'Mitglieder' })).toBeVisible({ timeout: 15_000 })
    await cookPage.reload({ waitUntil: 'networkidle' })
    await expect(cookPage.getByText('Kein Zugriff auf diese Seite.')).toHaveCount(0)
  } finally {
    // A failure above must not leave the site shut for the other tests.
    const banner = page.getByRole('button', { name: 'Löschung abbrechen' })
    if (await banner.isVisible().catch(() => false)) await banner.click()
    await owner.close()
    await cook.close()
  }
})
