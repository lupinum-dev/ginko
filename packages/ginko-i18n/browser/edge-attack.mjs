// Edge cases: baseURL /sub/, 4 locales (partial Italian, right-to-left Arabic), sitemap, server islands,
// the warned SWR rule, and dev-mode hot reload of messages. Usage: node test/edge-attack.mjs
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { request } from 'node:http'
import { createServer as netServer } from 'node:net'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const root = new URL('.', import.meta.url).pathname
const BASE = 'https://example.test/sub'
const results = []
const record = (id, ok, detail = '') => {
  results.push({ id, ok, detail })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${id}${detail ? ` — ${detail}` : ''}`)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const freePort = () => new Promise((r) => {
  const s = netServer().listen(0, () => {
    const { port } = s.address()
    s.close(() => r(port))
  })
})
function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers: { accept: 'text/html', ...headers }, agent: false }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', d => (body += d))
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body }))
    })
    req.on('error', reject)
    req.end()
  })
}
const attr = (tag, name) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1]
const head = html => ({
  lang: /<html[^>]+\blang="([^"]*)"/.exec(html)?.[1],
  dir: /<html[^>]+\bdir="([^"]*)"/.exec(html)?.[1],
  canonical: (html.match(/<link[^>]*rel="canonical"[^>]*>/g) ?? []).map(t => attr(t, 'href')),
  alternates: Object.fromEntries((html.match(/<link[^>]*rel="alternate"[^>]*>/g) ?? []).filter(t => attr(t, 'hreflang')).map(t => [attr(t, 'hreflang'), attr(t, 'href')])),
  h1: /<h1[^>]*>([^<]*)</.exec(html)?.[1]?.trim(),
  switcher: [...html.matchAll(/<a[^>]*data-test="switch-(\w+)"[^>]*>/g)].map(m => attr(m[0], 'href')),
})

async function startServer(dir) {
  const port = await freePort()
  const proc = spawn('node', [join(dir, 'server/index.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' })
  for (let i = 0; i < 50; i++) {
    try {
      await get(`http://localhost:${port}/sub/`)
      break
    }
    catch { await sleep(100) }
  }
  return { url: `http://localhost:${port}`, stop: () => proc.kill() }
}

const browser = await chromium.launch()
async function open(url, locale = 'de-AT') {
  const context = await browser.newContext({ locale })
  const page = await context.newPage()
  page.setDefaultTimeout(5000)
  const messages = []
  page.on('console', (m) => {
    if (['warning', 'error'].includes(m.type()))
      messages.push(m.text())
  })
  page.on('pageerror', e => messages.push(`pageerror: ${e.message}`))
  await page.goto(url, { waitUntil: 'networkidle' })
  await sleep(150)
  return { page, context, messages }
}

// ---------- built app ----------
{
  const server = await startServer(join(root, 'apps/edge/.output'))
  const b = server.url
  const pages = [
    ['/sub/', 'de-AT', 'ltr', 'Willkommen'], ['/sub/en', 'en-GB', 'ltr', 'Welcome'], ['/sub/it', 'it-IT', 'ltr', 'Benvenuti'],
    ['/sub/ar', 'ar', 'rtl', 'أهلاً وسهلاً'], ['/sub/ueber-uns', 'de-AT', 'ltr', 'Über uns'], ['/sub/it/about', 'it-IT', 'ltr', 'Chi siamo'],
  ]
  for (const [path, lang, dir, h1] of pages) {
    const r = await get(b + encodeURI(path))
    const h = head(r.body)
    const self = `https://example.test${path === '/sub/' ? path : path.replace(/\/$/, '')}`
    record(`${path} status, lang, dir, h1`, r.status === 200 && h.lang === lang && h.dir === dir && h.h1 === h1, `${r.status} ${h.lang} ${h.dir} "${h.h1}"`)
    record(`${path} canonical has base`, h.canonical.length === 1 && h.canonical[0] === self, JSON.stringify(h.canonical))
    record(`${path} 4 hreflang + x-default, all under /sub`, Object.keys(h.alternates).length === 5 && Object.values(h.alternates).every(u => u.startsWith(`${BASE}`)), JSON.stringify(h.alternates))
    record(`${path} switcher links keep the base`, h.switcher.length === 4 && h.switcher.every(s => s.startsWith('/sub/')), JSON.stringify(h.switcher))
    const { context, messages } = await open(b + encodeURI(path))
    const issues = messages.filter(m => /hydrat|mismatch|pageerror/i.test(m))
    record(`${path} hydration clean`, issues.length === 0, issues.join(' | ').slice(0, 200))
    await context.close()
  }
  {
    const { page, context } = await open(`${b}/sub/ar`)
    const zero = await page.textContent('[data-test=cart]')
    await page.click('[data-test=add]')
    const one = await page.textContent('[data-test=cart]')
    await page.click('[data-test=add]')
    const two = await page.textContent('[data-test=cart]')
    await page.click('[data-test=add]')
    const three = await page.textContent('[data-test=cart]')
    record('Arabic plural categories zero/one/two/few', zero === 'لا عناصر' && one === 'عنصر واحد' && two === 'عنصران' && three === '3 عناصر', `${zero} | ${one} | ${two} | ${three}`)
    await page.click('[data-test=switch-it]')
    await page.waitForURL(/\/sub\/it$/)
    await sleep(200)
    record('client switch ar→it updates lang and dir', (await page.getAttribute('html', 'lang')) === 'it-IT' && (await page.getAttribute('html', 'dir')) === 'ltr', `${await page.getAttribute('html', 'lang')} ${await page.getAttribute('html', 'dir')}`)
    await context.close()
  }
  for (const [path, expect, location] of [['/sub/EN/about', 301, '/sub/en/about'], ['/en/about', 302, '/sub/en/about']]) {
    const r = await get(b + path)
    record(`${path} → ${expect} ${location}`, r.status === expect && r.location === location, `${r.status} ${r.location ?? ''}`)
  }
  {
    const first = JSON.parse((await get(`${b}/sub/api/greet?name=A`, { 'accept': 'application/json', 'accept-language': 'it' })).body)
    record('API under /sub gets the locale', first.locale === 'it', JSON.stringify(first))
    const second = JSON.parse((await get(`${b}/sub/api/greet?name=A`, { 'accept': 'application/json', 'accept-language': 'en' })).body)
    record('[warned] SWR on /api/** serves the first language to everyone', second.locale !== 'en', `en request got ${JSON.stringify(second)} (the build warned about this rule)`)
  }
  {
    const sm = await get(`${b}/sub/sitemap.xml`)
    const locs = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
    record('sitemap lists each page once, with the base, studio without alternates', locs.length === new Set(locs).size && locs.every(l => l.startsWith('https://example.test/sub')) && locs.includes('https://example.test/sub/studio') && !sm.body.split('<url>').find(u => u.includes('/sub/studio<'))?.includes('hreflang'), `${locs.length} urls`)
    const entry = sm.body.split('<url>').find(u => u.includes('<loc>https://example.test/sub/en/about</loc>')) ?? ''
    record('sitemap pairs translated slugs (/en/about ↔ /ueber-uns)', /hreflang="de-AT" href="https:\/\/example.test\/sub\/ueber-uns"|href="https:\/\/example.test\/sub\/ueber-uns" hreflang="de-AT"/.test(entry) && /x-default/.test(entry), entry.replace(/\s+/g, ' ').slice(0, 400))
  }
  {
    const r = await get(`${b}/sub/en/island`)
    const islands = [...r.body.matchAll(/data-test="island"[^>]*>([^<]*)</g)].map(m => m[1].trim())
    record('server components render in the page locale (SSR)', islands.length === 2 && islands.every(t => t === 'Welcome (en)'), JSON.stringify(islands))
    const { page, context, messages } = await open(`${b}/sub/en/island`)
    const after = await page.$$eval('[data-test=island]', els => els.map(e => e.textContent.trim()))
    record('server components keep the locale after hydration', after.length === 2 && after.every(t => t === 'Welcome (en)'), JSON.stringify(after))
    record('island page hydration clean', !messages.some(m => /hydrat|mismatch|pageerror/i.test(m)), messages.join(' | ').slice(0, 200))
    await context.close()
  }
  server.stop()
  const log = readFileSync(join(root, 'targets/edge-build.log'), 'utf8')
  record('build warns about the /api/** cache rule', /routeRules "\/api\/\*\*" caches/.test(log))
  record('build names missing Arabic messages', /ar: \d+ message\(s\) missing/.test(log))
}

// ---------- dev mode: edit a message, the open page updates without a reload ----------
{
  const file = join(root, 'apps/n4/i18n/en.json')
  const original = readFileSync(file, 'utf8')
  const port = await freePort()
  const dev = spawn('pnpm', ['nuxt', 'dev', '--port', String(port)], { cwd: join(root, 'apps/n4'), stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  dev.stdout.on('data', d => (log += d))
  dev.stderr.on('data', d => (log += d))
  try {
    for (let i = 0; i < 120; i++) {
      try {
        const r = await get(`http://localhost:${port}/en`)
        if (r.status === 200)
          break
      }
      catch { /* The dev server may still be starting. */ }
      await sleep(500)
    }
    const { page, context } = await open(`http://localhost:${port}/en`)
    await page.waitForSelector('[data-test=title]', { timeout: 30000 })
    await page.evaluate(() => {
      window.__noReload = true
    })
    const before = await page.textContent('[data-test=title]')
    writeFileSync(file, original.replace('Welcome (app layer)', 'Welcome (hot)'))
    let after = before
    for (let i = 0; i < 40 && after === before; i++) {
      await sleep(250)
      after = await page.textContent('[data-test=title]').catch(() => after)
    }
    const kept = await page.evaluate(() => window.__noReload === true).catch(() => false)
    record('dev: edited message appears without a page reload', after === 'Welcome (hot)' && kept, `before "${before}" after "${after}" sameDocument=${kept}`)
    const ssr = await get(`http://localhost:${port}/en`)
    record('dev: server render uses the edited message too', ssr.body.includes('Welcome (hot)'), head(ssr.body).h1)
    await context.close()
  }
  finally {
    writeFileSync(file, original)
    dev.kill('SIGTERM')
    mkdirSync(join(root, '.evidence'), { recursive: true })
    writeFileSync(join(root, '.evidence/dev.log'), log)
  }
}

await browser.close()
writeFileSync(join(root, '.evidence/edge-attack.json'), JSON.stringify(results, null, 2))
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed, ${failed.length} failed`)
process.exit(failed.length ? 1 : 0)
