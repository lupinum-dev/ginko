// Gate 7: signs in once as the platform admin (support access to every site) and stores the session for all specs.
// Sign-in is the platform e2e's: a code from the local mail outbox, a .test address.
import { chromium, type FullConfig } from '@playwright/test'
import { signIn } from '../../../apps/platform/e2e/local.ts'
import { newestMail } from '../../outbox.ts'
import { job } from './studio.ts'

export default async function setup(config: FullConfig) {
  const { baseURL, locale } = config.projects[0]!.use
  const browser = await chromium.launch()
  const context = await browser.newContext({ baseURL, locale })
  // The Studio runs in dev mode: the first page after sign-in is compiled on request, which is slow on a busy machine.
  context.setDefaultTimeout(120_000)
  await signIn(await context.newPage(), process.env.TEMPLATE_ADMIN!)
  await context.storageState({ path: process.env.TEMPLATE_AUTH! })

  // Only a template whose jobs.json has an "approval" job: a staff member with the right to write news (a volunteer
  // whose post needs a check), invited by the admin and signed in with the invite link, as an owner would do it in the
  // Studio. Its session is for the spec of that job.
  if (!('approval' in JSON.parse(process.env.TEMPLATE_STUDIO ?? '{}'))) return await browser.close()
  const staff = process.env.TEMPLATE_STAFF!
  const admin = await context.newPage()
  await admin.goto(`/s/${process.env.TEMPLATE_SITE}/team`, { waitUntil: 'networkidle' })
  await admin.getByRole('button', { name: 'Einladen' }).click()
  await admin.getByLabel('E-Mail-Adresse').fill(staff)
  await admin.getByRole('checkbox', { name: job('approval', ['task']).task, exact: true }).check()
  await admin.getByRole('button', { name: 'Einladung senden' }).click()
  await admin.getByText(staff).first().waitFor()
  const link = newestMail(staff)?.text.match(/(http\S+\/invite\/\S+)/)?.[1]
  if (!link) throw new Error(`No invite link for ${staff} in the outbox`)
  const volunteer = await browser.newContext({ baseURL, locale })
  volunteer.setDefaultTimeout(120_000)
  const page = await volunteer.newPage()
  await signIn(page, staff)
  await page.goto(link, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Einladung annehmen' }).click()
  await page.waitForURL(new RegExp(`/s/${process.env.TEMPLATE_SITE}`))
  await volunteer.storageState({ path: process.env.TEMPLATE_AUTH_STAFF! })
  await browser.close()
}
