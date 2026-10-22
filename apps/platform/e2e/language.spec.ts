// The Studio speaks the browser's language until the person saves one (ginko-i18n user-locale zone: cookie, then
// Accept-Language, then English). The other e2e files run in a German browser (playwright.config.ts).
import { expect, test } from '@playwright/test'
import { STATE } from './global-setup'

test('a browser with en-US sees the English sign-in, "My sites" and "Account settings"', async ({ browser, baseURL }) => {
  const visitor = await browser.newContext({ baseURL, locale: 'en-US' })
  const login = await visitor.newPage()
  await login.goto('/login', { waitUntil: 'networkidle' })
  await expect(login.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(login.getByLabel('Email address')).toBeVisible()
  await visitor.close()

  const owner = await browser.newContext({ baseURL, locale: 'en-US', storageState: STATE.owner })
  const sites = await owner.newPage()
  // `?all` keeps the list open (a single site would open at once).
  await sites.goto('/?all', { waitUntil: 'networkidle' })
  await expect(sites.getByRole('heading', { name: 'My sites', level: 1 })).toBeVisible()
  await sites.goto('/account', { waitUntil: 'networkidle' })
  await expect(sites.getByRole('heading', { name: 'Account settings', level: 1 })).toBeVisible()
  await expect(sites.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
  await owner.close()
})

test('the language picked in "Account settings" is saved on the account and wins over the browser', async ({ browser, baseURL }) => {
  // The cook's account: the German setting this leaves behind matches every other test (German browser).
  const context = await browser.newContext({ baseURL, locale: 'en-US', storageState: STATE.cook })
  const page = await context.newPage()
  await page.goto('/account', { waitUntil: 'networkidle' })
  // The picker is a select named "Language" (or "Sprache", when an earlier run left German on the account).
  const choose = async (language: string) => {
    await page.getByRole('combobox', { name: /^(Language|Sprache)$/ }).click()
    await page.getByRole('option', { name: language, exact: true }).click()
  }
  await choose('English')
  await expect(page.getByRole('heading', { name: 'Account settings', level: 1 })).toBeVisible()
  await choose('Deutsch')
  await expect(page.getByRole('heading', { name: 'Kontoeinstellungen', level: 1 })).toBeVisible()
  // Without the cookie the zone would fall back to the browser's English; the account setting brings German back.
  await context.clearCookies({ name: 'ginko_locale' })
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Kontoeinstellungen', level: 1 })).toBeVisible()
  await context.close()
})

// Wrong behaviour caught: a wrong or old Studio address showed Nuxt's English "Page not found" with no Studio frame and
// no way back to the site.
test('an unknown Studio address says so in the browser\'s language and leads back to the site', async ({ browser, baseURL }) => {
  const owner = await browser.newContext({ baseURL, locale: 'de-DE', storageState: STATE.owner })
  const page = await owner.newPage()
  await page.goto('/s/restaurant/doesnotexist', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Diese Adresse gibt es im Studio nicht.', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: 'Heute' }).click()
  await expect(page).toHaveURL(/\/s\/restaurant$/)
  await expect(page.getByRole('heading', { name: 'Heute', level: 1 })).toBeVisible()
  await owner.close()
})
