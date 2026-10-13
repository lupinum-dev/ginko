// Prepares a fresh LOCAL Convex backend (packages/ginko-server, `convex dev` running) for sign-in and the demos:
// sets the environment variables the platform needs, only those still missing, and the auth signing key.
//   node --experimental-strip-types scripts/setup-local.ts
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const server = new URL('../packages/ginko-server/', import.meta.url).pathname
const env = readFileSync(`${server}.env.local`, 'utf8')
if (!/^CONVEX_DEPLOYMENT=anonymous/m.test(env)) throw new Error('packages/ginko-server/.env.local points at a non-local deployment. Stopped.')
// A deploy key wins over .env.local in the Convex CLI and would send this to the cloud.
if (process.env.CONVEX_DEPLOY_KEY) throw new Error('CONVEX_DEPLOY_KEY is set: this script is for the local backend only. Stopped.')

const convex = (...args: string[]) => execFileSync('npx', ['convex', ...args], { cwd: server, encoding: 'utf8' })
const secret = () => randomBytes(32).toString('hex')
/** A value from packages/ginko-server/.env.local, where the Nuxt side reads it: both sides must agree. */
const local = (name: string) => env.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim()

// The platform UI runs on 3100 (apps/platform `pnpm dev`, the e2e tests).
const wanted: Record<string, () => string> = {
  GINKO_LOCAL: () => '1',
  GINKO_MAIL: () => 'outbox',
  SITE_URL: () => 'http://localhost:3100',
  GINKO_ADMIN_EMAILS: () => 'admin@example.test',
  BETTER_AUTH_SECRETS: () => `0:${secret()}`,
  BCN_AUTH_PROXY_IP_SECRET: () => local('BCN_AUTH_PROXY_IP_SECRET') ?? secret(),
}

const have = new Set(convex('env', 'list').split('\n').map((line) => line.split('=')[0]))
for (const [name, value] of Object.entries(wanted)) {
  if (have.has(name)) continue
  convex('env', 'set', name, value())
  console.log(`set ${name}`)
}

// The Nuxt side must send the same proxy secret and know the same site URL, or sign-in returns 403.
let file = env
for (const name of ['BCN_AUTH_PROXY_IP_SECRET', 'SITE_URL']) {
  const value = convex('env', 'get', name).trim()
  if (local(name) === value) continue
  const line = `${name}=${value}`
  file = new RegExp(`^${name}=.*$`, 'm').test(file) ? file.replace(new RegExp(`^${name}=.*$`, 'm'), line) : `${file.replace(/\n?$/, '\n')}${line}\n`
  console.log(`wrote ${name} to packages/ginko-server/.env.local`)
}
if (file !== env) writeFileSync(`${server}.env.local`, file)
console.log(convex('run', 'auth:ensureSigningKey').trim() || 'signing key ready')
