// The file-brick part of `ginko check` (CONTENT.md, "Links zwischen Seiten"): the same bundles and link check as
// the Nuxt build (src/nuxt/module.ts, useFiles), without writing anything. Needs @lupinum/ginko-content, an optional peer.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { checkExternalLinks, type Fetch } from '../nuxt/external-links.ts'
import { checkLinks, serializeSchema, type Bundle, type SiteInput } from '../core/index.ts'
import { english } from './report.ts'

/** Prints the issues and returns false when one of them is an error (warnings do not fail the check). */
export async function checkFileLinks(input: { config: SiteInput; root: string; log: (line: string) => void; fetch?: Fetch }): Promise<boolean> {
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
  // Same options as the build: unknown paths are checked only for sites with file bricks alone.
  const onlyFiles = Object.values(schema.bricks).every((b) => b.source === 'files')
  const issues = checkLinks(Object.values(result.bundles) as Bundle[], schema, {
    linkCheck: input.config.linkCheck,
    redirects: input.config.redirects,
    files: onlyFiles ? (path) => existsSync(join(publicDir, path)) : undefined,
  })
  issues.push(...await checkExternalLinks(Object.values(result.bundles) as Bundle[], { linkCheck: input.config.linkCheck, root: input.root, log: input.log, fetch: input.fetch }))
  for (const i of issues) {
    input.log(`content/${i.id}: ${english(i)}`)
    if (i.severity === 'error') ok = false
  }
  return ok
}
