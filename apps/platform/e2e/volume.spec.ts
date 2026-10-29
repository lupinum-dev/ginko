// The Studio at volume (VOL-1, VOL-4): an open entry page reads only its own entry, so a save of another entry sends it
// little. Before, every page subscribed to the whole site and got all of it again on every save anywhere.
import { expect, test } from '@playwright/test'
import { STATE } from './global-setup'
import { resetContent } from './local'

// 140 more dishes with long descriptions: the menu then holds 148 of its 150, and the whole site is far over 100 KB.
test.beforeEach(() => resetContent({ brick: 'menu', count: 140 }))
test.afterAll(() => resetContent())
test.use({ storageState: STATE.owner })

test('an open entry receives less than 50 KB when someone saves another entry', async ({ page, browser }) => {
  await page.goto('/s/restaurant/all/menu', { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: 'Gebeizter Saibling', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Gebeizter Saibling')
  await page.waitForLoadState('networkidle')

  // Every byte the open tab gets over its WebSocket from here on.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  let bytes = 0
  cdp.on('Network.webSocketFrameReceived', (frame) => { bytes += frame.response.payloadData.length })

  const other = await browser.newPage({ storageState: STATE.owner, viewport: { width: 1440, height: 900 } })
  await other.goto('/s/restaurant/all/menu', { waitUntil: 'networkidle' })
  await other.getByRole('link', { name: 'Frittatensuppe', exact: true }).click()
  await other.getByRole('textbox', { name: 'Beschreibung' }).fill('Mit Schnittlauch')
  await other.getByRole('button', { name: 'Speichern' }).click()
  await expect(other.getByText('Gespeichert, noch nicht online', { exact: true })).toBeVisible()
  // Let the update reach the first tab too.
  await page.waitForTimeout(1000)
  await other.close()

  expect(bytes).toBeLessThan(50_000)
})
