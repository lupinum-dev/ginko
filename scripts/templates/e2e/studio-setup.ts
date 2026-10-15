// Gate 7: signs in once as the platform admin (support access to every site) and stores the session for all specs.
// Sign-in is the platform e2e's: a code from the local mail outbox, a .test address.
import { chromium, type FullConfig } from '@playwright/test'
import { signIn } from '../../../apps/platform/e2e/local.ts'

export default async function setup(config: FullConfig) {
  const { baseURL, locale } = config.projects[0]!.use
  const browser = await chromium.launch()
  const context = await browser.newContext({ baseURL, locale })
  await signIn(await context.newPage(), process.env.TEMPLATE_ADMIN!)
  await context.storageState({ path: process.env.TEMPLATE_AUTH! })
  await browser.close()
}
