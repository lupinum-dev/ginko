// Content attacks: a blog whose entries have their own slug per locale ("nur-hier" exists only in German),
// listed on /blog, under ginko-i18n. Runs the n4 targets of build-all.sh. Usage: node content-attack.mjs [filter]
// Port of the old ginko-content spike. Its apps/content (npm @lupinum/ginko-content on @nuxt/content) is gone, so the
// entries come from the fixture's own post API. What a real content module adds is not covered (see
// research/content-contract.md).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer, request } from 'node:http'
import { createServer as netServer } from 'node:net'
import { extname, join } from 'node:path'
import { chromium } from '@playwright/test'

const root = new URL('.', import.meta.url).pathname
const filter = process.argv[2] ?? ''
const BASE = 'https://example.test'
const LANG = { de: 'de-AT', en: 'en-GB' }
const results = []
const record = (target, id, ok, detail = '') => {
  results.push({ target, id, ok, detail })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${target} ${id}${detail ? ` — ${detail}` : ''}`)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
// Free port from the OS: fixed ports collide with other dev servers on this machine.
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
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.end()
  })
}
async function startSsr(dir) {
  const port = await freePort()
  const proc = spawn('node', [join(dir, 'server/index.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' })
  for (let i = 0; i < 50; i++) {
    try {
      await get(`http://localhost:${port}/api/greet`)
      break
    }
    catch { await sleep(100) }
  }
  return { url: `http://localhost:${port}`, stop: () => proc.kill() }
}
// Behaves like Netlify/Vercel static hosting: /a → a.html or a/index.html, else 404.html with status 404.
async function startStatic(dir) {
  const port = await freePort()
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json' }
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const file = [path, `${path}.html`, join(path, 'index.html')].map(p => join(dir, p)).find(f => existsSync(f) && statSync(f).isFile())
    if (file) {
      res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
      return res.end(readFileSync(file))
    }
    res.writeHead(404, { 'content-type': 'text/html' })
    res.end(existsSync(join(dir, '404.html')) ? readFileSync(join(dir, '404.html')) : '')
  })
  await new Promise(r => server.listen(port, r))
  return { url: `http://localhost:${port}`, stop: () => server.close() }
}
const attr = (tag, name) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1]
function headOf(html) {
  const links = html.match(/<link[^>]*>/g) ?? []
  return {
    lang: /<html[^>]+\blang="([^"]*)"/.exec(html)?.[1],
    h1: /<h1[^>]*>([^<]*)</.exec(html)?.[1]?.trim(),
    alternates: Object.fromEntries(links.filter(t => attr(t, 'rel') === 'alternate' && attr(t, 'hreflang')).map(t => [attr(t, 'hreflang'), attr(t, 'href')])),
    switcher: Object.fromEntries([...html.matchAll(/<a[^>]*data-test="switch-(\w+)"[^>]*>/g)].map(m => [m[1], { href: attr(m[0], 'href'), translated: attr(m[0], 'data-translated') }])),
  }
}

const browser = await chromium.launch()
async function open(url) {
  const context = await browser.newContext({ locale: 'en-GB' })
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

async function attack(name, base, strategy) {
  const d = strategy === 'prefix' ? '/de' : ''
  const posts = [
    { path: `${d}/blog/hallo-welt`, locale: 'de', h1: 'Hallo Welt', alt: { en: '/en/blog/hello-world' } },
    { path: '/en/blog/hello-world', locale: 'en', h1: 'Hello world', alt: { de: `${d}/blog/hallo-welt` } },
    { path: `${d}/blog/grüße`, locale: 'de', h1: 'Grüße', alt: { en: '/en/blog/greetings' } },
    { path: '/en/blog/greetings', locale: 'en', h1: 'Greetings', alt: { de: `${d}/blog/grüße` } },
    { path: `${d}/blog/nur-hier`, locale: 'de', h1: 'Nur hier', alt: { en: null } },
  ]
  for (const p of posts) {
    const r = await get(base + encodeURI(p.path))
    const h = headOf(r.body)
    record(name, `status ${p.path}`, r.status === 200, `${r.status}`)
    if (r.status !== 200) continue
    record(name, `h1+lang ${p.path}`, h.h1 === p.h1 && h.lang === LANG[p.locale], `"${h.h1}" ${h.lang}`)
    for (const [code, expected] of Object.entries(p.alt)) {
      const sw = h.switcher[code]
      if (expected) {
        record(name, `switcher ${p.path}→${code}`, sw?.href === encodeURI(expected) && sw?.translated === 'true', JSON.stringify(sw))
        record(name, `hreflang ${p.path}→${code}`, h.alternates[LANG[code]] === `${BASE}${encodeURI(expected)}`, JSON.stringify(h.alternates))
      }
      else {
        record(name, `untranslated ${p.path}→${code} links home, no hreflang`, sw?.translated === 'false' && sw?.href === `/${code}` && !h.alternates[LANG[code]], JSON.stringify({ sw, alt: h.alternates }))
      }
    }
    const { context, messages } = await open(base + encodeURI(p.path))
    const issues = messages.filter(m => /hydrat|mismatch|pageerror|E1001/i.test(m))
    record(name, `hydration clean ${p.path}`, issues.length === 0, issues.join(' | ').slice(0, 250))
    await context.close()
  }
  for (const path of ['/en/blog/nur-hier', '/en/blog/hallo-welt', `${d}/blog/hello-world`]) {
    const r = await get(base + path)
    record(name, `wrong-locale slug ${path}`, r.status === 404, `${r.status}`)
  }
  // Client navigation from the list into a post: alternates must follow the entry's slug.
  {
    const { page, context, messages } = await open(`${base}${d}/blog`)
    await page.click('[data-test=post] >> text=Hallo Welt')
    await page.waitForURL(/hallo-welt$/)
    await sleep(300)
    const sw = await page.getAttribute('[data-test=switch-en]', 'href')
    const alt = await page.getAttribute('link[rel=alternate][hreflang=en-GB]', 'href').catch(() => null)
    record(name, 'client nav: switcher has translated slug', sw === '/en/blog/hello-world', `switch=${sw}`)
    record(name, 'client nav: hreflang has translated slug', alt === `${BASE}/en/blog/hello-world`, `hreflang=${alt}`)
    await page.click('[data-test=switch-en]')
    await page.waitForURL(/hello-world$/)
    await sleep(300)
    record(name, 'client switch lands on English post', (await page.textContent('h1')) === 'Hello world' && (await page.getAttribute('html', 'lang')) === 'en-GB', await page.textContent('h1'))
    await page.goBack()
    await sleep(400)
    record(name, 'back returns to German post', (await page.textContent('h1')) === 'Hallo Welt' && (await page.getAttribute('html', 'lang')) === 'de-AT', await page.textContent('h1'))
    const errs = messages.filter(m => !/Failed to load resource/.test(m))
    record(name, 'no console errors during navigation', errs.length === 0, errs.join(' | ').slice(0, 250))
    await context.close()
  }
  {
    const { page, context } = await open(`${base}/en/blog`)
    const links = await page.$$eval('[data-test=post]', els => els.map(e => e.getAttribute('href')))
    record(name, 'English list links only English posts', JSON.stringify(links.sort()) === JSON.stringify(['/en/blog/greetings', '/en/blog/hello-world']), JSON.stringify(links))
    await context.close()
  }
}

const targets = ['n4-prefix_except_default', 'n4-prefix'].filter(t => t.includes(filter))
for (const target of targets) {
  const strategy = target.endsWith('-prefix') ? 'prefix' : 'prefix_except_default'
  for (const mode of ['ssr', 'static']) {
    const dir = join(root, 'targets', target, mode)
    if (!existsSync(dir)) {
      record(`${target} ${mode}`, 'built', false, `${dir} missing: run build-all.sh`)
      continue
    }
    const server = mode === 'ssr' ? await startSsr(dir) : await startStatic(dir)
    try {
      await attack(`${target} ${mode}`, server.url, strategy)
    }
    catch (error) { record(`${target} ${mode}`, 'crashed', false, error.message.split('\n')[0]) }
    server.stop()
  }
}
await browser.close()
mkdirSync(join(root, '.evidence'), { recursive: true })
writeFileSync(join(root, '.evidence/content-attack.json'), JSON.stringify(results, null, 2))
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed, ${failed.length} failed`)
process.exitCode = failed.length ? 1 : 0
