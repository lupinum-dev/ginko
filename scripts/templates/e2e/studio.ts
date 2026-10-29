// Shared by the gate 7 specs (templates/_features/<feature>/e2e/studio/*.spec.ts, templates/_studio/<template>/*.spec.ts):
// where the Studio and the site are, and the template's own names for a job.
import { expect, type Page } from '@playwright/test'
export const studio = {
  /** The site's slug on the platform; the Studio opens it at /s/<slug>. */
  site: process.env.TEMPLATE_SITE ?? '',
  siteUrl: process.env.TEMPLATE_SITE_URL ?? 'http://localhost:3000',
}

/**
 * The names a template uses for one Studio job, from `{ "<key>": { <field>: … } }` in templates/_studio/<template>/jobs.json
 * (platform.ts passes them in TEMPLATE_STUDIO). The specs of a shared feature stay generic; each template says what its
 * content is called. A name that is missing stops the spec with a message that names it.
 */
export function studioJob<Field extends string>(all: Record<string, Record<string, string> | undefined>, key: string, fields: readonly Field[]): Record<Field, string> {
  const names = all[key]
  const missing = fields.filter((field) => !names?.[field])
  if (!names || missing.length) throw new Error(`templates/_studio/<template>/jobs.json needs "${key}": { ${missing.map((field) => `"${field}"`).join(', ')} } for this Studio job.`)
  return Object.fromEntries(fields.map((field) => [field, names[field]!])) as Record<Field, string>
}

export const job = <Field extends string>(key: string, fields: readonly Field[]) => studioJob(JSON.parse(process.env.TEMPLATE_STUDIO ?? '{}'), key, fields)

/**
 * "Veröffentlichen …" then "Jetzt" in Inhalte (SPEC 15): typed input is saved on the way and goes online. Speichern
 * alone keeps a change off the website, and a new entry is a draft until it is published.
 */
export async function publishNow(page: Page) {
  await page.getByRole('button', { name: 'Veröffentlichen …' }).first().click()
  await page.getByRole('button', { name: 'Jetzt veröffentlichen' }).first().click()
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: /veröffentlicht/i }).first()).toBeVisible()
}
