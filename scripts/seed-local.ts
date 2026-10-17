// Local demo: resets the restaurant site in the LOCAL Convex backend to the contract corpus and
// prints invite links for the owner and the cook (SPEC 13 roles). Run after `pnpm local:dev` created the site:
//   node --experimental-strip-types scripts/seed-local.ts            (content, members and invites)
//   node --experimental-strip-types scripts/seed-local.ts --content  (content only; members stay)
//   ... --many menu=140   adds 140 copies of the brick's first corpus entry, each with its own name and a long
//                         description (a site at volume, for the Studio's volume test)
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const server = new URL('../packages/ginko-server/', import.meta.url).pathname
const env = readFileSync(`${server}.env.local`, 'utf8')
if (!/^CONVEX_DEPLOYMENT=anonymous/m.test(env)) throw new Error('packages/ginko-server/.env.local points at a non-local deployment. Stopped.')
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

const many = process.argv.indexOf('--many')
if (many !== -1) {
  const [brick, count] = (process.argv[many + 1] ?? '').split('=')
  const rows: { id: string; order?: number; data: Record<string, unknown> }[] | undefined = corpus[brick ?? '']
  if (!rows?.length || !Number(count)) throw new Error('Usage: --many <brick>=<count>, for a brick the corpus has entries of.')
  const filler = 'Hausgemacht nach dem Rezept der Großmutter, mit Kräutern aus dem eigenen Garten und Gemüse vom Markt. '.repeat(4).trim()
  for (let i = 1; i <= Number(count); i++) {
    // Every translatable text gets a number (a list shows each copy by its own name); a longtext fills up to its limit.
    const data = Object.fromEntries(Object.entries(rows[0]!.data).map(([key, value]) => [key, value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Record<string, unknown>).de === 'string'
      ? { de: key === 'description' ? filler : `${(value as Record<string, string>).de} ${i}` }
      : value]))
    rows.push({ id: `${brick}-many-${i}`, order: rows.length + 1, data })
  }
}

const people = [
  { email: 'wirtin@example.test', role: 'owner', grants: [] },
  { email: 'koch@example.test', role: 'staff', grants: ['menu.edit', 'menu.price', 'menu.add', 'menu.remove', 'lunch.lunchWeek'] },
]
const args = process.argv.includes('--content') ? { site: 'restaurant', corpus } : { site: 'restaurant', corpus, people }
const out = execFileSync('npx', ['convex', 'run', 'seed:reset', JSON.stringify(args)], { cwd: server, encoding: 'utf8' })
console.log(out)
