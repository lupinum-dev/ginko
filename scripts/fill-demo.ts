// Fills the HOSTED demo site with the contract corpus and invites the demo people (demo:fill).
// Runs only against the deployment of CONVEX_DEPLOY_KEY, never against packages/ginko-server/.env.local:
//   CONVEX_DEPLOY_KEY=prod:… node --experimental-strip-types scripts/fill-demo.ts [site=restaurant]
// The demo people have .test addresses: their codes and invites stay in the outbox (pnpm outbox <email>).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

if (!process.env.CONVEX_DEPLOY_KEY?.startsWith('prod:')) throw new Error('CONVEX_DEPLOY_KEY (prod:…) fehlt. Gestoppt.')
const site = process.argv[2] ?? 'restaurant'
const corpus = JSON.parse(readFileSync(new URL(`../contracts/${site}/data.json`, import.meta.url), 'utf8'))
// The demo people per site (.test addresses). Staff get exactly the tasks of their job (DEMOS.md).
const peopleBySite: Record<string, { email: string; role: 'owner' | 'staff'; grants: string[] }[]> = {
  restaurant: [
    { email: 'wirtin@example.test', role: 'owner', grants: [] },
    { email: 'koch@example.test', role: 'staff', grants: ['menu.edit', 'menu.price', 'menu.add', 'menu.remove', 'lunch.lunchWeek'] },
  ],
  industrie: [
    { email: 'marketing@example.test', role: 'owner', grants: [] },
    { email: 'hr@example.test', role: 'staff', grants: ['jobs.add', 'jobs.edit', 'jobs.remove'] },
  ],
  saas: [
    { email: 'gruenderin@example.test', role: 'owner', grants: [] },
    { email: 'entwicklung@example.test', role: 'staff', grants: ['changelog.add', 'changelog.edit', 'changelog.remove'] },
  ],
}
const people = peopleBySite[site]
if (!people) throw new Error(`No demo people for site "${site}".`)
const server = new URL('../packages/ginko-server/', import.meta.url).pathname
console.log(execFileSync('npx', ['convex', 'run', 'demo:fill', JSON.stringify({ site, corpus, people })], { cwd: server, encoding: 'utf8' }))
