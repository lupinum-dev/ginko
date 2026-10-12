// Break-it suite for the walking skeleton. Runs every built target (targets/<app>-<strategy>/{ssr,static})
// in a real browser and reports what breaks. Usage: node test/attack.mjs [filter]
// Remote: --remote <https-url> --name <label> --strategy <strategy>; optional VERCEL_AUTOMATION_BYPASS_SECRET.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { Agent as HttpAgent, createServer, request } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { createServer as netServer } from 'node:net'
import { extname, join } from 'node:path'
import { chromium } from '@playwright/test'

// Free port from the OS: fixed ports collide with other dev servers on this machine.
const freePort = () => new Promise((r) => {
  const s = netServer().listen(0, () => {
    const { port } = s.address()
    s.close(() => r(port))
  })
})

const root = new URL('.', import.meta.url).pathname
const args = process.argv.slice(2)
const option = key => args[args.indexOf(key) + 1]
const remote = args.includes('--remote') ? option('--remote')?.replace(/\/$/, '') : null
const remoteStrategy = args.includes('--strategy') ? option('--strategy') : undefined
if (args.includes('--remote') && (!remote || !args.includes('--name') || !['prefix', 'prefix_except_default'].includes(remoteStrategy))) throw new Error('Usage: --remote <url> --name <label> --strategy <prefix|prefix_except_default>')
if (remote && new URL(remote).protocol !== 'https:') throw new Error('Remote URL must use HTTPS')
const protectionHeaders = remote && process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}
const filter = remote ? '' : (process.argv[2] ?? '')
const BASE = 'https://example.test'
const results = []
const record = (target, id, ok, detail = '') => {
  results.push({ target, id, ok, detail })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${target} ${id}${detail ? ` — ${detail}` : ''}`)
}

// ---------- servers ----------
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function startSsr(dir) {
  const port = await freePort()
  const proc = spawn('node', [join(dir, 'server/index.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  proc.stdout.on('data', d => (log += d))
  proc.stderr.on('data', d => (log += d))
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://localhost:${port}/api/greet`)
      break
    }
    catch { await sleep(100) }
  }
  return { url: `http://localhost:${port}`, stop: () => proc.kill(), log: () => log }
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.xml': 'application/xml' }
// Behaves like Netlify/Vercel static hosting: /a → a.html or a/index.html, else 404.html with status 404.
async function startStatic(dir) {
  const port = await freePort()
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const candidates = [path, `${path}.html`, join(path, 'index.html')].map(p => join(dir, p))
    const file = candidates.find(f => existsSync(f) && statSync(f).isFile())
    if (file) {
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      return res.end(readFileSync(file))
    }
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
    res.end(existsSync(join(dir, '404.html')) ? readFileSync(join(dir, '404.html')) : 'not found')
  })
  await new Promise(r => server.listen(port, r))
  return { url: `http://localhost:${port}`, stop: () => server.close(), log: () => '' }
}

// ---------- html helpers ----------
const attr = (tag, name) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1]
function headOf(html) {
  const tags = html.match(/<link[^>]*>|<meta[^>]*>/g) ?? []
  const links = tags.filter(t => t.startsWith('<link'))
  return {
    lang: /<html[^>]+\blang="([^"]*)"/.exec(html)?.[1],
    dir: /<html[^>]+\bdir="([^"]*)"/.exec(html)?.[1],
    canonical: links.filter(t => attr(t, 'rel') === 'canonical').map(t => attr(t, 'href')),
    alternates: Object.fromEntries(links.filter(t => attr(t, 'rel') === 'alternate' && attr(t, 'hreflang')).map(t => [attr(t, 'hreflang'), attr(t, 'href')])),
    ogLocale: tags.filter(t => attr(t, 'property') === 'og:locale').map(t => attr(t, 'content')),
    h1: /<h1[^>]*>([^<]*)</.exec(html)?.[1]?.trim(),
    switcher: Object.fromEntries([...html.matchAll(/<a[^>]*data-test="switch-(\w+)"[^>]*>/g)].map(m => [m[1], attr(m[0], 'href')])),
  }
}
// node:http, not fetch: Node 24's fetch throws setTypeOfService EINVAL on macOS under load.
function get(url, headers = {}, agent = false) {
  return new Promise((resolve, reject) => {
    const req = (url.startsWith('https:') ? httpsRequest : request)(url, { headers: { accept: 'text/html', ...protectionHeaders, ...headers }, agent }, (res) => {
      let html = ''
      res.setEncoding('utf8')
      res.on('data', d => (html += d))
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location ?? null, vary: res.headers.vary ?? null, html }))
    })
    if (remote) req.setTimeout(60000, () => req.destroy(new Error('Remote request timed out')))
    req.on('error', reject)
    req.end()
  })
}

// ---------- browser helpers ----------
let browser
async function open(url, options = {}) {
  const context = await browser.newContext({ locale: options.locale ?? 'de-AT', timezoneId: options.timezoneId ?? 'Europe/Vienna', javaScriptEnabled: options.js !== false, extraHTTPHeaders: protectionHeaders })
  if (options.cookie) await context.addCookies([{ name: 'ginko_locale', value: options.cookie, url }])
  const page = await context.newPage()
  page.setDefaultTimeout(5000)
  const messages = []
  page.on('console', (m) => {
    if (['warning', 'error'].includes(m.type()))
      messages.push(m.text())
  })
  page.on('pageerror', e => messages.push(`pageerror: ${e.message}`))
  const requests = []
  page.on('response', async (r) => {
    if (r.url().endsWith('.js'))
      requests.push(r)
  })
  const response = await page.goto(url, { waitUntil: 'networkidle' })
  await sleep(150)
  return { page, context, messages, requests, response }
}
const hydrationIssues = msgs => msgs.filter(m => /hydrat|mismatch/i.test(m))
const errorsOf = msgs => msgs.filter(m => !/404|Failed to load resource/.test(m))

// ---------- expectations ----------
const LANG = { de: 'de-AT', en: 'en-GB' }
function pagesFor(strategy) {
  const d = strategy === 'prefix' ? '/de' : ''
  return [
    { path: d || '/', locale: 'de', h1: 'Willkommen' },
    { path: '/en', locale: 'en', h1: /^Welcome/ },
    { path: `${d}/ueber-uns`, locale: 'de', h1: 'Über uns' },
    { path: '/en/about', locale: 'en', h1: 'About us' },
    { path: `${d}/blog/hallo-welt`, locale: 'de', h1: 'Hallo Welt' },
    { path: '/en/blog/hello-world', locale: 'en', h1: 'Hello world' },
    { path: `${d}/blog/grüße`, locale: 'de', h1: 'Grüße' },
    { path: '/en/blog/greetings', locale: 'en', h1: 'Greetings' },
    { path: `${d}/blog/nur-hier`, locale: 'de', h1: 'Nur hier' },
    { path: `${d}/nur-deutsch`, locale: 'de', h1: 'Nur auf Deutsch' },
  ]
}
const matches = (value, expected) => expected instanceof RegExp ? expected.test(value ?? '') : value === expected

// ---------- attacks ----------
async function attackPages(name, base, strategy) {
  const pages = pagesFor(strategy)
  const heads = {}
  for (const p of pages) {
    const url = base + encodeURI(p.path)
    const ssr = await get(url)
    const head = headOf(ssr.html)
    heads[p.path] = head
    record(name, `status ${p.path}`, ssr.status === 200, `got ${ssr.status}`)
    if (ssr.status !== 200) continue
    record(name, `ssr h1 ${p.path}`, matches(head.h1, p.h1), `"${head.h1}"`)
    record(name, `html lang ${p.path}`, head.lang === LANG[p.locale], `lang=${head.lang}`)
    const canonical = `${BASE}${encodeURI(p.path)}`
    record(name, `one canonical ${p.path}`, head.canonical.length === 1 && [canonical, `${BASE}${p.path}`].includes(head.canonical[0]), JSON.stringify(head.canonical))
    record(name, `og:locale ${p.path}`, head.ogLocale[0] === LANG[p.locale].replace('-', '_'), JSON.stringify(head.ogLocale))
    // Switcher links in the HTML must agree with hreflang (crawlers and no-JS users see this HTML).
    const translatedSwitch = Object.entries(head.switcher).filter(([code]) => head.alternates[LANG[code]])
    const disagree = translatedSwitch.filter(([code, href]) => `${BASE}${href}` !== head.alternates[LANG[code]] && `${BASE}${encodeURI(href)}` !== head.alternates[LANG[code]])
    record(name, `ssr switcher == hreflang ${p.path}`, disagree.length === 0, disagree.map(([c, h]) => `${c}: switch ${h} vs hreflang ${head.alternates[LANG[c]]}`).join('; '))
    const untranslated = Object.keys(head.switcher).filter(code => !head.alternates[LANG[code]])
    for (const code of untranslated) {
      const href = head.switcher[code]
      const target = await get(base + href)
      record(name, `untranslated switch target ${p.path}→${code}`, target.status === 200, `${href} → ${target.status}`)
    }

    // Hydration: same text before and after, no warnings.
    const { page, context, messages } = await open(url, { locale: p.locale === 'de' ? 'en-GB' : 'de-AT', timezoneId: 'Pacific/Kiritimati' })
    const h1 = (await page.locator('h1').first().textContent())?.trim()
    record(name, `hydrated h1 ${p.path} (other browser lang, UTC+14)`, matches(h1, p.h1), `"${h1}"`)
    record(name, `no hydration warning ${p.path}`, hydrationIssues(messages).length === 0, hydrationIssues(messages).join(' | ').slice(0, 300))
    record(name, `no console errors ${p.path}`, errorsOf(messages).length === 0, errorsOf(messages).join(' | ').slice(0, 300))
    const switchAfter = Object.fromEntries(await page.locator('[data-test^=switch-]').evaluateAll(els => els.map(e => [e.dataset.test.slice(7), e.getAttribute('href')])))
    record(name, `switcher stable after hydration ${p.path}`, JSON.stringify(switchAfter) === JSON.stringify(head.switcher), `ssr ${JSON.stringify(head.switcher)} client ${JSON.stringify(switchAfter)}`)
    await context.close()
  }

  // hreflang reciprocity and x-default across the set.
  const byUrl = Object.fromEntries(Object.entries(heads).map(([path, h]) => [`${BASE}${encodeURI(path)}`, h]))
  for (const [path, head] of Object.entries(heads)) {
    const self = `${BASE}${encodeURI(path)}`
    if (!head.alternates || !Object.keys(head.alternates).length) {
      record(name, `hreflang present ${path}`, false, 'none')
      continue
    }
    const selfListed = Object.values(head.alternates).includes(self) || Object.values(head.alternates).includes(`${BASE}${path}`)
    record(name, `hreflang includes self ${path}`, selfListed, JSON.stringify(head.alternates))
    record(name, `x-default ${path}`, !!head.alternates['x-default'], head.alternates['x-default'] ?? 'missing')
    for (const [lang, href] of Object.entries(head.alternates)) {
      if (lang === 'x-default' || href === self) continue
      const other = byUrl[href]
      if (!other) {
        record(name, `hreflang target crawled ${path}→${lang}`, false, `${href} not in tested set`)
        continue
      }
      record(name, `hreflang reciprocal ${path}↔${lang}`, Object.values(other.alternates).includes(self) || Object.values(other.alternates).includes(`${BASE}${path}`), `${href} lists ${JSON.stringify(other.alternates)}`)
    }
  }
}

async function attackInteraction(name, base, strategy) {
  const d = strategy === 'prefix' ? '/de' : '/'
  // Plural reactivity after hydration.
  {
    const { page, context } = await open(base + d)
    await page.click('[data-test=add]')
    const one = await page.textContent('[data-test=cart]')
    await page.click('[data-test=add]')
    const two = await page.textContent('[data-test=cart]')
    record(name, 'plural reacts after hydration', one === '1 Artikel' && two === '2 Artikel', `${one} / ${two}`)
    await context.close()
  }
  // Switch locale client-side, then nav, then back: head, lang and text follow the URL.
  {
    const { page, context, messages } = await open(base + d)
    await page.click('[data-test=switch-en]')
    await page.waitForURL(/\/en$/)
    await sleep(200)
    const s1 = { url: new URL(page.url()).pathname, h1: await page.textContent('h1'), lang: await page.getAttribute('html', 'lang'), canonical: await page.getAttribute('link[rel=canonical]', 'href') }
    record(name, 'client switch de→en', s1.h1?.startsWith('Welcome') && s1.lang === 'en-GB' && s1.canonical === `${BASE}/en`, JSON.stringify(s1))
    await page.click('[data-test=nav-about]')
    await page.waitForURL(/\/en\/about$/)
    await sleep(200)
    const alts = await page.$$eval('link[rel=alternate]', els => els.map(e => `${e.getAttribute('hreflang')}=${e.getAttribute('href')}`))
    record(name, 'head alternates update on client nav', alts.includes(`de-AT=${BASE}${strategy === 'prefix' ? '/de' : ''}/ueber-uns`), alts.join(', '))
    await page.goBack()
    await page.waitForURL(/\/en$/)
    await page.goBack()
    await sleep(300)
    const s2 = { url: new URL(page.url()).pathname, h1: await page.textContent('h1'), lang: await page.getAttribute('html', 'lang') }
    record(name, 'back button restores de', s2.h1 === 'Willkommen' && s2.lang === 'de-AT', JSON.stringify(s2))
    record(name, 'no hydration/console issues during client nav', errorsOf(messages).length === 0, errorsOf(messages).join(' | ').slice(0, 300))
    await context.close()
  }
  // Client nav into a dynamic page: switcher and hreflang must use the translated slug.
  {
    const { page, context } = await open(base + d)
    await page.click('[data-test=nav-blog]')
    await page.waitForURL(/hallo-welt$/)
    await sleep(300)
    const sw = await page.getAttribute('[data-test=switch-en]', 'href')
    const alt = await page.getAttribute('link[rel=alternate][hreflang=en-GB]', 'href')
    record(name, 'client nav to blog: switcher uses translated slug', sw === '/en/blog/hello-world', `switch=${sw}`)
    record(name, 'client nav to blog: hreflang uses translated slug', alt === `${BASE}/en/blog/hello-world`, `hreflang=${alt}`)
    await page.click('[data-test=switch-en]')
    await sleep(400)
    record(name, 'switch on blog lands on English post', (await page.textContent('h1')) === 'Hello world', `${new URL(page.url()).pathname} "${await page.textContent('h1')}"`)
    await page.click('[data-test=nav-blog]')
    await sleep(400)
    record(name, 'nav "Blog" link in English is not a 404', !(await page.locator('[data-test=error-title]').count()), `${new URL(page.url()).pathname}`)
    await context.close()
  }
  // Rapid toggling: the last click wins and everything agrees with the URL.
  {
    const { page, context } = await open(base + d)
    for (let i = 0; i < 7; i++) await page.click(`[data-test=switch-${i % 2 ? 'de' : 'en'}]`, { noWaitAfter: true }).catch(() => {})
    await sleep(800)
    const path = new URL(page.url()).pathname
    const state = { path, h1: await page.textContent('h1'), lang: await page.getAttribute('html', 'lang') }
    const isEn = path.startsWith('/en')
    record(name, 'rapid toggling ends consistent', (isEn ? state.h1?.startsWith('Welcome') && state.lang === 'en-GB' : state.h1 === 'Willkommen' && state.lang === 'de-AT'), JSON.stringify(state))
    await context.close()
  }
  // Suggestion only after hydration, only when a translation exists.
  {
    const { page, context, messages } = await open(base + d, { locale: 'en-GB' })
    const s = await page.locator('[data-test=suggestion] a').getAttribute('href').catch(() => null)
    record(name, 'suggests /en to English browser on German home', s === '/en', `href=${s}`)
    record(name, 'suggestion causes no hydration warning', hydrationIssues(messages).length === 0, hydrationIssues(messages).join(' | ').slice(0, 200))
    await context.close()
    const { page: p2, context: c2 } = await open(`${base}${strategy === 'prefix' ? '/de' : ''}/nur-deutsch`, { locale: 'en-GB' })
    record(name, 'no suggestion for untranslated page', !(await p2.locator('[data-test=suggestion]').count()))
    await c2.close()
  }
  // Message plumbing.
  {
    const { page, context } = await open(`${base}/en`)
    const text = id => page.textContent(`[data-test=${id}]`)
    record(name, 'ICU tags render slots', (await page.innerHTML('[data-test=consent]')).includes('<strong>everything</strong>'), await page.innerHTML('[data-test=consent]'))
    record(name, 'global tone param', (await text('cta')) === 'Contact us', await text('cta'))
    record(name, 'selectordinal', (await text('place')) === '3rd place', await text('place'))
    record(name, 'de-AT/en-GB date', (await text('date')) === 'As of 15 January 2026', await text('date'))
    record(name, 'lib namespace en', (await text('lib')) === 'Save / Saved at 12:00', await text('lib'))
    record(name, 'missing key shows key', (await text('missing')) === 'does.not.exist', await text('missing'))
    // D5: a missing translation falls back to the default locale, never a raw key or empty text.
    record(name, 'key missing in en falls back to German', (await text('fallback')) === 'Dieser Text fehlt im Englischen.', await text('fallback'))
    await context.close()
    const { page: de, context: c2, requests } = await open(base + d)
    record(name, 'app override beats lib (de)', (await de.textContent('[data-test=lib]'))?.startsWith('Sichern'), await de.textContent('[data-test=lib]'))
    record(name, 'de date uses Jänner', (await de.textContent('[data-test=date]')) === 'Stand: 15. Jänner 2026', await de.textContent('[data-test=date]'))
    const bodies = await Promise.all(requests.map(r => r.text().catch(() => '')))
    record(name, 'German page loads no English messages', !bodies.some(b => b.includes('Contact us')), `${requests.length} js files`)
    await c2.close()
  }
}

async function attackUrls(name, base, strategy) {
  const d = strategy === 'prefix' ? '/de' : ''
  const isStatic = () => name.endsWith('static')
  for (const [path, lang, text] of [['/en/nope', 'en-GB', 'Page not found'], [`${d}/nope`, 'de-AT', 'Seite nicht gefunden']]) {
    const { page, context, messages } = await open(base + path)
    const h1 = await page.textContent('h1').catch(() => null)
    record(name, `404 in browser ${path}`, (await page.getAttribute('html', 'lang')) === lang && h1?.includes(text) && !hydrationIssues(messages).length, `${await page.getAttribute('html', 'lang')} "${h1}"`)
    await context.close()
  }
  const cases = [
    { path: '/EN/about', expect: 'redirect to /en/about', ok: r => (r.status === 301 && r.location === '/en/about') || (r.status === 200 && headOf(r.html).lang === 'en-GB' && headOf(r.html).canonical[0] === `${BASE}/en/about`) },
    { path: '/En', expect: 'redirect to /en', ok: r => (r.status === 301 && r.location === '/en') || (r.status === 200 && headOf(r.html).lang === 'en-GB' && headOf(r.html).canonical[0] === `${BASE}/en`) },
    { path: '/en/ueber-uns', expect: 404, ok: r => r.status === 404 },
    { path: '/about', expect: 404, ok: r => r.status === 404 },
    { path: '/fr', expect: 404, ok: r => r.status === 404 },
    { path: '/fr/about', expect: 404, ok: r => r.status === 404 },
    // Static hosts serve Nuxt's client-rendered 404.html shell; it is checked in the browser below.
    { path: '/en/nope', expect: '404 in English', ok: r => r.status === 404 && (isStatic(r) || (headOf(r.html).lang === 'en-GB' && /Page not found/.test(r.html))) },
    { path: `${d}/nope`, expect: '404 in German', ok: r => r.status === 404 && (isStatic(r) || (headOf(r.html).lang === 'de-AT' && /Seite nicht gefunden/.test(r.html))) },
    { path: '/en/nur-deutsch', expect: 404, ok: r => r.status === 404 },
    { path: '/en/blog/nur-hier', expect: 404, ok: r => r.status === 404 },
    { path: '/en/', expect: 'canonical without slash', ok: r => r.status !== 200 || headOf(r.html).canonical[0] === `${BASE}/en` },
    { path: `${d}/ueber-uns/`, expect: 'canonical without slash', ok: r => r.status !== 200 || headOf(r.html).canonical[0] === `${BASE}${d}/ueber-uns` },
    { path: '/en/about?utm_source=x', expect: 'canonical drops query', ok: r => headOf(r.html).canonical[0] === `${BASE}/en/about` },
    { path: '/studio', expect: 'unlocalized page, default locale, no hreflang', ok: r => r.status === 200 && headOf(r.html).lang === 'de-AT' && !Object.keys(headOf(r.html).alternates).length },
    { path: '/en/blog/gr%C3%BC%C3%9Fe', expect: 404, ok: r => r.status === 404 },
  ]
  if (strategy === 'prefix_except_default') cases.push(
    { path: '/de', expect: 'not a duplicate of /', ok: r => r.status === 404 || (r.status >= 300 && r.status < 400) },
    { path: '/de/ueber-uns', expect: 'not a duplicate of /ueber-uns', ok: r => r.status === 404 || (r.status >= 300 && r.status < 400) },
  )
  for (const c of cases) {
    const r = await get(base + c.path)
    const h = headOf(r.html)
    record(name, `url ${c.path} → ${c.expect}`, c.ok(r), `status ${r.status} lang ${h.lang} h1 "${h.h1}" canonical ${h.canonical}`)
  }
}

async function attackServer(name, base, strategy) {
  const greet = async headers => JSON.parse((await get(`${base}/api/greet?name=Ana`, { accept: 'application/json', ...headers })).html)
  const cases = [
    [{ 'accept-language': 'en-US,en;q=0.9' }, 'en'],
    [{ 'accept-language': 'en-GB;q=0, de;q=0.5' }, 'de'],
    [{ 'accept-language': '*' }, 'de'],
    [{ 'accept-language': 'x;;q=abc,,,;q=' }, 'de'],
    [{ 'accept-language': `${'zz-ZZ,'.repeat(2000)}en` }, 'en'],
    [{ cookie: 'ginko_locale=en' }, 'en'],
    [{ 'cookie': 'ginko_locale=<script>', 'accept-language': 'en' }, 'en'],
    [{}, 'de'],
  ]
  for (const [headers, expected] of cases) {
    const body = await greet(headers).catch(e => ({ error: e.message }))
    record(name, `api locale ${JSON.stringify(headers).slice(0, 60)}`, body.locale === expected, JSON.stringify(body))
  }
  // Request isolation: interleaved locales under load.
  const paths = ['/en', '/en/about', '/ueber-uns', '/blog/hallo-welt', '/en/blog/hello-world', '/']
  const expect = { '/en': 'en-GB', '/en/about': 'en-GB', '/ueber-uns': 'de-AT', '/blog/hallo-welt': 'de-AT', '/en/blog/hello-world': 'en-GB', '/': 'de-AT' }
  const prefix = p => (strategy ? strategy === 'prefix' : (name.includes('-prefix ') || name.endsWith('prefix ssr'))) && !p.startsWith('/en') ? (p === '/' ? '/de' : `/de${p}`) : p
  // 64 sockets at a time: macOS queues at most 128 waiting connections (kern.ipc.somaxconn) and resets the rest, which is the OS, not the site.
  const burst = new HttpAgent({ maxSockets: 64 })
  const runs = await Promise.all(Array.from({ length: 240 }, (_, i) => paths[i % paths.length]).map(async (p) => {
    const r = await get(base + prefix(p), { 'accept-language': p.startsWith('/en') ? 'de' : 'en' }, remote ? false : burst)
    const h = headOf(r.html)
    return { p, ok: r.status === 200 && h.lang === expect[p] && (expect[p] === 'en-GB' ? /Welcome|About|Hello/.test(r.html) : /Willkommen|Über uns|Hallo/.test(r.html)), status: r.status, lang: h.lang }
  }))
  burst.destroy()
  const bad = runs.filter(r => !r.ok)
  record(name, '240 concurrent mixed-locale SSR requests isolated', bad.length === 0, `${bad.length} wrong: ${JSON.stringify(bad.slice(0, 3))}`)
}

async function attackPrefixRoot(name, base, mode) {
  if (mode === 'ssr') {
    const cases = [[{ 'accept-language': 'en-GB' }, '/en'], [{ 'accept-language': 'de-DE' }, '/de'], [{}, '/de'], [{ 'cookie': 'ginko_locale=en', 'accept-language': 'de' }, '/en']]
    for (const [headers, loc] of cases) {
      const r = await get(`${base}/?utm=1`, headers)
      record(name, `root redirect ${JSON.stringify(headers)}`, r.status === 302 && r.location === `${loc}?utm=1`, `${r.status} → ${r.location}`)
    }
    const r = await get(`${base}/`, { 'accept-language': 'en' })
    record(name, 'root redirect sends Vary for caches', /accept-language/i.test(r.vary ?? '') && /cookie/i.test(r.vary ?? ''), `vary=${r.vary}`)
  }
  for (const [browserLocale, cookie, expected] of [['en-GB', undefined, '/en'], ['de-AT', undefined, '/de'], ['de-AT', 'en', '/en'], ['fr-FR', undefined, '/de']]) {
    const { page, context, messages } = await open(`${base}/?utm=1`, { locale: browserLocale, cookie })
    await sleep(300)
    const u = new URL(page.url())
    record(name, `root ${mode} browser=${browserLocale} cookie=${cookie ?? '-'}`, u.pathname === expected && u.search === '?utm=1', `${u.pathname}${u.search}`)
    record(name, `root ${mode} no console issues (${browserLocale})`, errorsOf(messages).length === 0, errorsOf(messages).join(' | ').slice(0, 200))
    await context.close()
  }
  if (mode === 'static') {
    const { page, context } = await open(`${base}/`, { js: false })
    await sleep(500)
    record(name, 'root without JS lands on /de (meta refresh)', new URL(page.url()).pathname === '/de', page.url())
    await context.close()
  }
}

// ---------- run ----------
browser = await chromium.launch()
for (const target of (remote ? [option('--name')] : readdirSync(join(root, 'targets')).filter(t => !t.startsWith('content-')).sort())) {
  const strategy = remoteStrategy ?? (target.endsWith('prefix') && !target.endsWith('except_default') ? 'prefix' : 'prefix_except_default')
  for (const mode of (remote ? ['ssr'] : ['ssr', 'static'])) {
    const name = `${target} ${mode}`
    if (filter && !name.includes(filter)) continue
    const dir = join(root, 'targets', target, mode)
    if (!remote && !existsSync(dir)) continue
    const server = remote ? { url: remote, stop() {} } : mode === 'ssr' ? await startSsr(dir) : await startStatic(dir)
    const groups = [
      ['pages', () => attackPages(name, server.url, strategy)],
      ['interaction', () => attackInteraction(name, server.url, strategy)],
      ['urls', () => attackUrls(name, server.url, strategy)],
      ['server', () => mode === 'ssr' && attackServer(name, server.url, remote ? strategy : undefined)],
      ['prefix root', () => strategy === 'prefix' && attackPrefixRoot(name, server.url, mode)],
    ]
    for (const [group, run] of groups) {
      try {
        await run()
      }
      catch (error) {
        // An AggregateError (connection refused on every address) has an empty message: name the code and the server's last words.
        const why = error.message || error.code || error.errors?.map(e => e.code).join(',') || String(error)
        record(name, `${group} attacks crashed`, false, `${why.split('\n')[0].slice(0, 200)}${server.log ? ` | server: ${server.log().slice(-300).replace(/\s+/g, ' ')}` : ''}`)
      }
    }
    server.stop()
  }
}
await browser.close()
const evidenceDir = join(root, remote ? '.evidence/vercel' : '.evidence')
mkdirSync(evidenceDir, { recursive: true })
writeFileSync(join(evidenceDir, remote ? `${option('--name').replace(/[^\w-]/g, '_')}-attack.json` : 'attack.json'), JSON.stringify(results, null, 2))
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed, ${failed.length} failed`)
process.exitCode = failed.length ? 1 : 0
