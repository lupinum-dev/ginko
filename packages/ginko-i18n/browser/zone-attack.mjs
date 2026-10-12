// Break-it suite for user-locale zones (`userLocale: ['/app/**']`). Runs the SSR build of every target
// (targets/<app>-<strategy>/ssr). Usage: node zone-attack.mjs [filter]
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { createServer as netServer } from 'node:net'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const freePort = () => new Promise((r) => {
  const s = netServer().listen(0, () => {
    const { port } = s.address()
    s.close(() => r(port))
  })
})
const root = new URL('.', import.meta.url).pathname
const filter = process.argv[2] ?? ''
const results = []
const record = (target, id, ok, detail = '') => {
  results.push({ target, id, ok, detail })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${target} ${id}${detail ? ` — ${detail}` : ''}`)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

// node:http, not fetch: Node 24's fetch throws setTypeOfService EINVAL on macOS under load.
function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    request(url, { headers: { accept: 'text/html', ...headers } }, (res) => {
      let html = ''
      res.setEncoding('utf8')
      res.on('data', d => (html += d))
      res.on('end', () => resolve({ status: res.statusCode, vary: res.headers.vary ?? null, html }))
    }).on('error', reject).end()
  })
}
async function startSsr(dir) {
  const port = await freePort()
  const proc = spawn('node', [join(dir, 'server/index.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  proc.stdout.on('data', d => (log += d))
  proc.stderr.on('data', d => (log += d))
  for (let i = 0; i < 50; i++) {
    try {
      await get(`http://localhost:${port}/api/greet`)
      break
    }
    catch { await sleep(100) }
  }
  return { url: `http://localhost:${port}`, stop: () => proc.kill(), log: () => log }
}
const lang = html => /<html[^>]+\blang="([^"]*)"/.exec(html)?.[1]
const h1 = html => /<h1[^>]*>([^<]*)</.exec(html)?.[1]?.trim()
const seoTags = html => (html.match(/<link[^>]*>|<meta[^>]*>/g) ?? []).filter(t => /rel="(?:canonical|alternate)"|hreflang|property="og:locale/.test(t))

let browser
async function open(url, options = {}) {
  const context = await browser.newContext({ locale: options.locale ?? 'de-AT', timezoneId: 'Europe/Vienna' })
  if (options.cookie) await context.addCookies([{ name: 'ginko_locale', value: options.cookie, url }])
  const page = await context.newPage()
  page.setDefaultTimeout(5000)
  const messages = []
  page.on('console', (m) => {
    if (['warning', 'error'].includes(m.type())) messages.push(m.text())
  })
  page.on('pageerror', e => messages.push(`pageerror: ${e.message}`))
  await page.goto(url, { waitUntil: 'networkidle' })
  await sleep(150)
  return { page, context, messages }
}
// The apps may extend the message (n4 appends a layer marker), so match the start.
const isEn = text => /^Welcome/.test(text ?? '')
const hydrationIssues = msgs => msgs.filter(m => /hydrat|mismatch/i.test(m))
const errorsOf = msgs => msgs.filter(m => !/404|Failed to load resource/.test(m))

async function attackZone(name, base, strategy) {
  const url = `${base}/app/settings`
  const d = strategy === 'prefix' ? '/de' : ''

  // (a) the cookie wins over the header.
  const a = await get(url, { cookie: 'ginko_locale=en', 'accept-language': 'de' })
  record(name, 'a: cookie en → html lang en and English text', a.status === 200 && lang(a.html) === 'en-GB' && isEn(h1(a.html)), `${a.status} lang=${lang(a.html)} h1=${h1(a.html)}`)
  // (b) no cookie: Accept-Language, then the default.
  const b = await get(url, { 'accept-language': 'de' })
  record(name, 'b: no cookie, Accept-Language de → German', lang(b.html) === 'de-AT' && h1(b.html) === 'Willkommen', `lang=${lang(b.html)} h1=${h1(b.html)}`)
  const b2 = await get(url, { 'accept-language': 'en-US,en;q=0.9' })
  record(name, 'b: no cookie, Accept-Language en → English', lang(b2.html) === 'en-GB' && isEn(h1(b2.html)), `lang=${lang(b2.html)} h1=${h1(b2.html)}`)
  const b3 = await get(url, { 'accept-language': 'fr' })
  record(name, 'b: no match → default locale', lang(b3.html) === 'de-AT', `lang=${lang(b3.html)}`)
  const b4 = await get(url, { cookie: 'ginko_locale=<script>', 'accept-language': 'en' })
  record(name, 'b: bad cookie falls back to header', lang(b4.html) === 'en-GB', `lang=${lang(b4.html)}`)
  record(name, 'zone response varies on cookie and Accept-Language', /accept-language/i.test(a.vary ?? '') && /cookie/i.test(a.vary ?? ''), `vary=${a.vary}`)
  record(name, 'inline messages are the user locale only', a.html.includes('window.__GINKO_I18N__={"en"') && !a.html.includes('"de":{'), 'inline payload')

  // (c) hydration: cookie, then the browser's Accept-Language; the client never detects it again.
  for (const [cookie, browserLocale] of [['en', 'de-AT'], [undefined, 'en-GB'], ['de', 'en-GB']]) {
    const label = `cookie=${cookie ?? '-'} browser=${browserLocale}`
    const { page, context, messages } = await open(url, { cookie, locale: browserLocale })
    const title = (await page.textContent('[data-test=title]'))?.trim()
    record(name, `c: hydrated text, ${label}`, ((cookie ?? (browserLocale.startsWith('en') ? 'en' : 'de')) === 'en' ? isEn(title) : title === 'Willkommen'), `"${title}"`)
    record(name, `c: no hydration warning or console error, ${label}`, !hydrationIssues(messages).length && !errorsOf(messages).length, messages.join(' | ').slice(0, 300))
    await context.close()
  }

  // (d) switch in place, cookie set, survives reload.
  {
    const { page, context, messages } = await open(url)
    const before = new URL(page.url()).pathname
    await page.click('[data-test=set-en]')
    await sleep(200)
    const state = { path: new URL(page.url()).pathname, title: (await page.textContent('[data-test=title]'))?.trim(), locale: (await page.textContent('[data-test=locale]'))?.trim(), lang: await page.getAttribute('html', 'lang') }
    record(name, 'd: switch to en re-renders in place', state.path === before && isEn(state.title) && state.locale === 'en' && state.lang === 'en-GB', JSON.stringify(state))
    const cookie = (await context.cookies()).find(c => c.name === 'ginko_locale')
    record(name, 'd: switch sets the ginko_locale cookie', cookie?.value === 'en' && cookie.path === '/' && cookie.sameSite === 'Lax', JSON.stringify(cookie))
    await page.reload({ waitUntil: 'networkidle' })
    await sleep(150)
    record(name, 'd: reload keeps en', isEn((await page.textContent('[data-test=title]'))?.trim()) && (await page.getAttribute('html', 'lang')) === 'en-GB', `"${await page.textContent('[data-test=title]')}"`)
    await page.click('[data-test=set-de]')
    await sleep(200)
    record(name, 'd: switch back to de', (await page.textContent('[data-test=title]'))?.trim() === 'Willkommen' && (await page.getAttribute('html', 'lang')) === 'de-AT', `"${await page.textContent('[data-test=title]')}"`)
    record(name, 'd: switching causes no console issues', !errorsOf(messages).length, messages.join(' | ').slice(0, 300))
    await context.close()
  }

  // Client navigation from a URL page into the zone and back: each side keeps its own rules.
  {
    const { page, context, messages } = await open(`${base}${d}/ueber-uns`)
    await page.evaluate(() => window.useNuxtApp().$router.push('/app/settings'))
    await sleep(500)
    record(name, 'client nav into the zone shows its page', (await page.locator('[data-test=set-en]').count()) === 1, new URL(page.url()).pathname)
    record(name, 'client nav into the zone: no hreflang or canonical', (await page.locator('link[rel=canonical], link[rel=alternate][hreflang]').count()) === 0, '')
    await page.evaluate(() => window.useNuxtApp().$router.push('/en/about'))
    await sleep(500)
    record(name, 'client nav out of the zone restores hreflang', (await page.locator('link[rel=alternate][hreflang]').count()) > 0, '')
    record(name, 'zone round trip: no console issues', !errorsOf(messages).length, messages.join(' | ').slice(0, 300))
    await context.close()
  }

  // (e) SEO on a zone page: lang and dir only.
  record(name, 'e: /app/settings has no canonical, hreflang or og:locale', seoTags(a.html).length === 0, seoTags(a.html).join(' '))
  record(name, 'e: /app/settings has dir', /<html[^>]+\bdir="ltr"/.test(a.html), '')
  // (f) a normal page still has them.
  const f = await get(`${base}/en/about`, { 'accept-language': 'de' })
  const tags = seoTags(f.html)
  record(name, 'f: normal page still has hreflang and canonical', tags.some(t => /hreflang="en-GB"/.test(t)) && tags.some(t => /rel="canonical"/.test(t)), `${tags.length} tags`)
  const g = await get(`${base}${d}/ueber-uns`, { cookie: 'ginko_locale=en' })
  record(name, 'normal page ignores the cookie (URL decides)', lang(g.html) === 'de-AT', `lang=${lang(g.html)}`)
  const s = await get(`${base}/studio`, { cookie: 'ginko_locale=en' })
  record(name, 'excluded page renders in the default locale', lang(s.html) === 'de-AT', `lang=${lang(s.html)}`)
  const clone = await get(`${base}/en/app/settings`)
  record(name, 'zone page has no per-locale clone', clone.status === 404, `status ${clone.status}`)
}

browser = await chromium.launch()
for (const target of readdirSync(join(root, 'targets')).filter(t => !t.startsWith('content-')).sort()) {
  const name = `${target} ssr`
  if (filter && !name.includes(filter)) continue
  const dir = join(root, 'targets', target, 'ssr')
  if (!existsSync(dir)) continue
  const strategy = target.endsWith('prefix') && !target.endsWith('except_default') ? 'prefix' : 'prefix_except_default'
  const server = await startSsr(dir)
  try {
    await attackZone(name, server.url, strategy)
  }
  catch (error) {
    record(name, 'zone attacks crashed', false, `${(error.message || error.code || String(error)).split('\n')[0].slice(0, 200)} | server: ${server.log().slice(-300).replace(/\s+/g, ' ')}`)
  }
  server.stop()
}
await browser.close()
const evidenceDir = join(root, '.evidence')
mkdirSync(evidenceDir, { recursive: true })
writeFileSync(join(evidenceDir, 'zone-attack.json'), JSON.stringify(results, null, 2))
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed, ${failed.length} failed`)
process.exitCode = failed.length ? 1 : 0
