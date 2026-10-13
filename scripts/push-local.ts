// Pushes a site's config to the LOCAL platform once, like `pnpm local:dev` does on every change.
//   node --experimental-strip-types scripts/push-local.ts [folder under sites/, default restaurant]
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { serializeSchema } from '../packages/ginko/src/core/index.ts'

const folder = process.argv[2] ?? 'restaurant'
const platform = new URL('../apps/platform/', import.meta.url).pathname
if (!/^CONVEX_DEPLOYMENT=anonymous/m.test(readFileSync(`${platform}.env.local`, 'utf8'))) throw new Error('Not the local deployment. Stopped.')
// A deploy key wins over .env.local in the Convex CLI and would send this to the cloud.
if (process.env.CONVEX_DEPLOY_KEY) throw new Error('CONVEX_DEPLOY_KEY is set: this script is for the local backend only. Stopped.')
const config = (await import(`../sites/${folder}/ginko.config.ts`)).default
const schema = serializeSchema(config)
// The site's name is the one in its config (sites/docs is `ginko-docs`), not the folder.
const site = schema.site
console.log(execFileSync('npx', ['convex', 'run', 'release:devPush', JSON.stringify({ site, schema })], { cwd: platform, encoding: 'utf8' }))
