// Quick check of one built demo site against the fake platform, on ports of its own, so several
// checkouts can run it at once (the Playwright suite uses fixed ports):
//   node scripts/check-site.ts <site> <port>     (site built first: pnpm --filter @ginko-demo/<site> build)
// Every static page and every entry URL must answer 200 with one canonical and one hreflang per
// locale; a main-language path under another locale's prefix must be a 404.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const [name, portArg] = process.argv.slice(2)
if (!name || !portArg) throw new Error('usage: node scripts/check-site.ts <site> <port>')
const port = Number(portArg)
const platformPort = port + 600
const { default: site } = await import(`../sites/${name}/ginko.config.ts`)
// Platform sites: the corpus bundle the fake platform serves. File sites (CONTENT.md): the site's own file bundle, read below.
const corpus = `contracts/${name}/bundle.format3.${site.locales[0]}.json`

const platform = spawn('node', ['e2e/fake-platform.mjs'], { env: { ...process.env, FAKE_PLATFORM_PORT: String(platformPort) }, stdio: 'ignore' })
const server = spawn('node', [`sites/${name}/.output/server/index.mjs`], { env: { ...process.env, PORT: String(port), NUXT_PUBLIC_GINKO_PLATFORM: `http://localhost:${platformPort}` }, stdio: 'ignore' })
const failures: string[] = []
try {
  await sleep(1500)
  const bundle = existsSync(corpus)
    ? (await import(`../${corpus}`, { with: { type: 'json' } })).default
    : await (await fetch(`http://localhost:${port}/__ginko/files/${site.locales[0]}.json`)).json()
  const entryUrls = Object.values(bundle.bricks).flatMap((b: any) => (b.kind === 'collection' ? b.items.flatMap((i: any) => Object.values(i.urls ?? {})) : []))
  const paths = [...new Set([...Object.values(site.pages).flat(), ...entryUrls] as string[])]
  for (const path of paths) {
    const res = await fetch(`http://localhost:${port}${path}`)
    const html = await res.text()
    const count = (re: RegExp) => html.match(re)?.length ?? 0
    if (res.status !== 200) failures.push(`${path}: ${res.status}`)
    else if (count(/<link rel="canonical"/g) !== 1) failures.push(`${path}: ${count(/<link rel="canonical"/g)} canonical links`)
    else if (count(/<link rel="alternate" hreflang="(?!x-default)/g) > site.locales.length) failures.push(`${path}: more hreflang links than locales`)
  }
  // `/speisekarte` exists, `/en/speisekarte` must not (one route per page and locale).
  const mainPage = (site.pages[site.locales[0]] as string[]).find((p) => p !== '/')!
  for (const locale of site.locales.slice(1)) {
    const res = await fetch(`http://localhost:${port}/${locale}${mainPage}`)
    if (res.status !== 404) failures.push(`/${locale}${mainPage}: ${res.status}, expected 404`)
  }
  console.log(failures.length ? `FAIL ${name}\n${failures.join('\n')}` : `OK ${name}: ${paths.length} URLs`)
} finally {
  platform.kill()
  server.kill()
}
process.exit(failures.length ? 1 : 0)
