// The file-brick part of `ginko check` (CONTENT.md, "Links zwischen Seiten"): the same bundles and link check as
// the Nuxt build (src/nuxt/module.ts, useFiles), without writing anything. Needs @lupinum/ginko-content, an optional peer.
import { join } from 'node:path'
import { fileLinkIssues, type Fetch } from '../nuxt/external-links.ts'
import { serializeSchema, type Bundle, type SiteInput } from '../core/index.ts'
import { english } from './report.ts'

/** Prints the issues and returns false when one of them is an error (warnings do not fail the check). */
export async function checkFileLinks(input: { config: SiteInput; root: string; log: (line: string) => void; fetch: Fetch }): Promise<boolean> {
  const schema = serializeSchema(input.config)
  if (!Object.values(schema.bricks).some((b) => b.source === 'files')) return true
  let content: typeof import('@lupinum/ginko-content')
  try {
    content = await import('@lupinum/ginko-content')
  } catch (error) {
    if ((error as { code?: string }).code !== 'ERR_MODULE_NOT_FOUND') throw error
    input.log('Install @lupinum/ginko-content to check file content.')
    return true
  }
  const contentDir = join(input.root, 'content')
  const publicDir = join(input.root, 'public')
  const result = await content.buildFileBundles({ contentDir, publicDir, schema, drafts: false })
  let ok = true
  for (const e of result.errors) {
    input.log(content.errorLine(e))
    ok = false
  }
  const issues = await fileLinkIssues({ bundles: Object.values(result.bundles) as Bundle[], schema, site: input.config, publicDir, root: input.root, log: input.log, fetch: input.fetch, external: true })
  for (const i of issues) {
    input.log(`content/${i.id}: ${english(i)}`)
    if (i.severity === 'error') ok = false
  }
  return ok
}
