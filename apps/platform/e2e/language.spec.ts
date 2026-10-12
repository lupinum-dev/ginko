// The Studio speaks the browser's language until the person saves one (ginko-i18n user-locale zone: cookie, then
// Accept-Language, then English). The other e2e files run in a German browser (playwright.config.ts).
import { expect, test } from '@playwright/test'
import { STATE } from './global-setup'

test('a browser with en-US sees the English sign-in and "My sites"', async ({ browser, baseURL }) => {
  const visitor = await browser.newContext({ baseURL, locale: 'en-US' })
  const login = await visitor.newPage()
  await login.goto('/login', { waitUntil: 'networkidle' })
  await expect(login.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(login.getByLabel('Email address')).toBeVisible()
  await visitor.close()

  const owner = await browser.newContext({ baseURL, locale: 'en-US', storageState: STATE.owner })
  const sites = await owner.newPage()
  // `?alle` keeps the list open (a single site would open at once).
  await sites.goto('/?alle', { waitUntil: 'networkidle' })
  await expect(sites.getByRole('heading', { name: 'My sites', level: 1 })).toBeVisible()
  await expect(sites.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await owner.close()
})

test('the language picked on "My sites" is saved on the account and wins over the browser', async ({ browser, baseURL }) => {
  // The cook's account: the German setting this leaves behind matches every other test (German browser).
  const context = await browser.newContext({ baseURL, locale: 'en-US', storageState: STATE.cook })
  const page = await context.newPage()
  await page.goto('/?alle', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByRole('heading', { name: 'My sites', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Deutsch' }).click()
  await expect(page.getByRole('heading', { name: 'Meine Seiten', level: 1 })).toBeVisible()
  // Without the cookie the zone would fall back to the browser's English; the account setting brings German back.
  await context.clearCookies({ name: 'ginko_locale' })
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Meine Seiten', level: 1 })).toBeVisible()
  await context.close()
})
