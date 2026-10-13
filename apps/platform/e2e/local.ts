// Helpers for the platform e2e tests (UI.md 9). They talk to the LOCAL Convex backend only: the
// deployment in packages/ginko-server/.env.local must be the anonymous local one, or every helper refuses.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { deflateSync, crc32 } from 'node:zlib'
import type { Page } from '@playwright/test'
import { newestMail } from '../../../scripts/outbox.ts'
import de from '../../../packages/ginko-server/i18n/de.json' with { type: 'json' }
import en from '../../../packages/ginko-server/i18n/en.json' with { type: 'json' }
import es from '../../../packages/ginko-server/i18n/es.json' with { type: 'json' }

/** The code mail comes in the person's language, which an earlier English test may have stored. */
const CODE_SUBJECTS = [de, en, es].map((catalog) => catalog.mail.code.subject)

/** The Convex project: `.env.local` (the local deployment) and the folder `npx convex` runs in. */
export const serverDir = new URL('../../../packages/ginko-server/', import.meta.url).pathname
const repoDir = new URL('../../../', import.meta.url).pathname

export function assertLocal() {
  if (process.env.CONVEX_DEPLOY_KEY) throw new Error('CONVEX_DEPLOY_KEY is set: the e2e tests write data and run against the local backend only. Stopped.')
  if (!/^CONVEX_DEPLOYMENT=anonymous/m.test(readFileSync(`${serverDir}.env.local`, 'utf8'))) {
    throw new Error('packages/ginko-server/.env.local is not the local Convex deployment. The e2e tests write data; stopped.')
  }
}

const script = (name: string, ...args: string[]) => execFileSync('node', ['--experimental-strip-types', `scripts/${name}`, ...args], { cwd: repoDir, encoding: 'utf8' })

/** Pushes the restaurant config and resets content, members and invites. Returns the invite links by email. */
export function resetAll(): Record<string, string> {
  assertLocal()
  script('push-local.ts')
  const out = script('seed-local.ts')
  const json = JSON.parse(out.slice(out.indexOf('{'))) as { links: { email: string; link: string }[] }
  return Object.fromEntries(json.links.map((l) => [l.email, l.link]))
}

/** Resets the content only; members stay signed in and keep their rights. */
export function resetContent() {
  assertLocal()
  script('seed-local.ts', '--content')
}

/** The newest sign-in code mailed to `email` (local outbox, GINKO_MAIL=outbox). */
export function codeFor(email: string): string {
  assertLocal()
  const code = newestMail(email, CODE_SUBJECTS)?.text.match(/(\d{6})/)?.[1]
  if (!code) throw new Error(`No sign-in code for ${email} in the outbox`)
  return code
}

/** Signs in through the real form with a code from the outbox. */
export async function signIn(page: Page, email: string) {
  await page.goto('/login', { waitUntil: 'networkidle' })
  await page.getByLabel('E-Mail-Adresse').fill(email)
  await page.getByRole('button', { name: 'Code senden' }).click()
  await page.getByLabel('Code').waitFor()
  await page.getByLabel('Code').fill(codeFor(email))
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

/** Opens Schnell ändern and waits until the tasks are there. */
export async function openQuick(page: Page) {
  await page.goto('/s/restaurant', { waitUntil: 'networkidle' })
  await page.getByRole('heading', { level: 2 }).first().waitFor()
}

/** A small valid PNG; `shade` makes its bytes (and so its hash) differ from other photos. */
export function pngBytes(shade: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc32(body))
    return Buffer.concat([head, body, tail])
  }
  const [w, h] = [48, 32]
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, (_, i) => [(shade + i * 3) % 256, 90, (shade * 7) % 256]).flat())])
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))])
}

/** A one-page PDF with `text` on it. */
export function pdfBytes(text: string): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${`BT /F1 12 Tf 10 50 Td (${text}) Tj ET`.length} >>\nstream\nBT /F1 12 Tf 10 50 Td (${text}) Tj ET\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out)
}
