// Local demo: resets the restaurant site in the LOCAL Convex backend to the contract corpus and
// prints invite links for the owner and the cook (SPEC 13 roles). Run after `pnpm local:dev` created the site:
//   node --experimental-strip-types scripts/seed-local.ts            (content, members and invites)
//   node --experimental-strip-types scripts/seed-local.ts --content  (content only; members stay)
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const platform = new URL('../apps/platform/', import.meta.url).pathname
const env = readFileSync(`${platform}.env.local`, 'utf8')
if (!/^CONVEX_DEPLOYMENT=anonymous/m.test(env)) throw new Error('apps/platform/.env.local points at a non-local deployment. Stopped.')
// A deploy key wins over .env.local in the Convex CLI and would send this to the cloud.
if (process.env.CONVEX_DEPLOY_KEY) throw new Error('CONVEX_DEPLOY_KEY is set: this script is for the local backend only. Stopped.')

const corpus = JSON.parse(readFileSync(new URL('../contracts/restaurant/data.json', import.meta.url), 'utf8'))
// The corpus plans its lunch weeks ahead of a fixed date. Move them by whole weeks so the first one is always next
// week: a planned week that has reached today changes what "this week's lunch" opens, and the demo and the e2e
// tests would change with the calendar.
const DAY = 86_400_000
const thisMonday = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()))
thisMonday.setUTCDate(thisMonday.getUTCDate() - ((thisMonday.getUTCDay() + 6) % 7))
const plans: { data: { weekOf: string } }[] = corpus.lunchPlans ?? []
const first = Math.min(...plans.map((p) => Date.parse(p.data.weekOf)))
const shift = Math.round((thisMonday.getTime() + 7 * DAY - first) / (7 * DAY)) * 7 * DAY
for (const p of plans) p.data.weekOf = new Date(Date.parse(p.data.weekOf) + shift).toISOString().slice(0, 10)

const people = [
  { email: 'wirtin@example.test', role: 'owner', grants: [] },
  { email: 'koch@example.test', role: 'staff', grants: ['menu.edit', 'menu.price', 'menu.add', 'menu.remove', 'lunch.lunchWeek'] },
]
const args = process.argv.includes('--content') ? { site: 'restaurant', corpus } : { site: 'restaurant', corpus, people }
const out = execFileSync('npx', ['convex', 'run', 'seed:reset', JSON.stringify(args)], { cwd: platform, encoding: 'utf8' })
console.log(out)
