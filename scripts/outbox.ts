// The newest mail to one address in a platform's outbox: sign-in code or invite link of a test account.
//   pnpm outbox wirtin@example.test                      local platform (apps/platform/.env.local)
//   CONVEX_DEPLOY_KEY=… pnpm outbox wirtin@example.test  the deployment of that key (hosted demo)
// Hosted, only `.test` addresses land in the outbox (SPEC 10); real addresses get real mail.
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export interface OutboxMail { to: string; subject: string; text: string; at: number }

const platformDir = fileURLToPath(new URL('../apps/platform/', import.meta.url))

/** The newest mail to `email` (case-insensitive), optionally with this subject, or undefined. */
/** The newest mail to `email`; with `subject`, the newest with that subject (or one of them). */
export function newestMail(email: string, subject?: string | readonly string[]): OutboxMail | undefined {
  const out = execFileSync('npx', ['convex', 'data', 'outbox', '--limit', '50', '--order', 'desc', '--format', 'jsonLines'], { cwd: platformDir, encoding: 'utf8' })
  const wanted = email.trim().toLowerCase()
  return out.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as OutboxMail).find((m) => m.to === wanted && (subject === undefined || (typeof subject === 'string' ? [subject] : subject).includes(m.subject)))
}

const isEntryPoint = process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntryPoint) {
  const email = process.argv[2]
  if (!email) {
    console.error('Verwendung: pnpm outbox <e-mail>')
    process.exit(1)
  }
  const mail = newestMail(email)
  if (!mail) {
    console.error(`Keine Mail an ${email} im Postausgang.`)
    process.exit(1)
  }
  console.log(`${new Date(mail.at).toLocaleString('de-AT', { timeZone: 'Europe/Vienna' })} · ${mail.subject}\n\n${mail.text}`)
}
