// Once per run: fresh restaurant content, the owner and the cook invited and accepted. Their sessions
// are stored, so each test starts signed in (UI.md 9). A stored session that still works is reused:
// Better Auth limits code mails per minute, and repeated runs would hit that limit.
import { existsSync } from 'node:fs'
import { chromium, type FullConfig } from '@playwright/test'
import { resetAll, signIn } from './local'

export const STATE = { owner: 'e2e/.state/wirtin.json', cook: 'e2e/.state/koch.json' }

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]!.use.baseURL!
  const links = resetAll()
  const browser = await chromium.launch()
  for (const [who, email] of [['owner', 'wirtin@example.test'], ['cook', 'koch@example.test']] as const) {
    // A stored session that the backend no longer knows (reset, expired) still opens the invite page,
    // but accepting fails. So: try the stored session once, else start clean and sign in.
    const accepted = existsSync(STATE[who]) && await accept(STATE[who])
    if (!accepted && !await accept(undefined)) throw new Error(`global setup: ${email} could not accept the invitation`)

    async function accept(state: string | undefined): Promise<boolean> {
      // Same language as the tests (a context made by hand does not get the project's `locale`).
      const context = await browser.newContext({ baseURL, locale: config.projects[0]!.use.locale, ...(state ? { storageState: state } : {}) })
      const page = await context.newPage()
      try {
        await page.goto(links[email]!, { waitUntil: 'networkidle' })
        if (new URL(page.url()).pathname.startsWith('/login')) {
          await signIn(page, email)
          await page.goto(links[email]!, { waitUntil: 'networkidle' })
        }
        await page.getByRole('button', { name: 'Einladung annehmen' }).click()
        await page.waitForURL(/\/s\/restaurant/, { timeout: state ? 10_000 : 30_000 })
        await context.storageState({ path: STATE[who] })
        return true
      } catch (error) {
        if (!state) throw error
        return false
      } finally {
        await context.close()
      }
    }
  }
  await browser.close()
}
