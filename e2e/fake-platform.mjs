// A stand-in for the platform's bundle endpoint (SPEC 6), for site end-to-end tests.
// Serves contracts/<site>/bundle.format3.<locale>.json. Control: GET /__control?mode=ok|503|hang|huge|proto|nofiles (also clears
// the recorded requests and messages), GET /__control/requests (the bundle requests seen, to check minRev
// forwarding) and GET /__control/messages (the navigate messages the preview page sent to the parent).
// GET /__parent?src=<preview url> is a page that frames the site preview like the platform does. On
// ginko:ready it answers with a preview bundle (the first notice reads "VORSCHAU"), sent by message, not
// fetched; ginko:navigate messages are recorded.
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DEFAULT_WEEK, todayIn, workWeekOf } from '../packages/ginko/src/core/time.ts'

const root = fileURLToPath(new URL('../contracts/', import.meta.url))
const port = Number(process.env.FAKE_PLATFORM_PORT ?? 3999)
let mode = 'ok'
const requests = []
const messages = []

/** Drops every value that is an uploaded file or image ({ url, … }), wherever it sits in the data. */
function withoutFiles(value) {
  if (Array.isArray(value)) return value.map(withoutFiles)
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const [key, inner] of Object.entries(value)) {
    if (inner && typeof inner === 'object' && !Array.isArray(inner) && typeof inner.url === 'string' && key !== 'urls') continue
    out[key] = withoutFiles(inner)
  }
  return out
}

function previewBundle(locale) {
  const bundle = JSON.parse(readFileSync(`${root}restaurant/bundle.format3.${locale}.json`, 'utf8'))
  // The first notice, kept visible whatever today is (the corpus notice ran out on 2026-10-08).
  bundle.bricks.notices.items[0].data.text = 'VORSCHAU'
  delete bundle.bricks.notices.items[0].data.until
  return bundle
}

function parentPage(src) {
  const bundles = { de: previewBundle('de'), en: previewBundle('en') }
  return `<!doctype html><title>Plattform</title>
<iframe id="preview" src="${src.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" style="width:100%;height:90vh;border:0"></iframe>
<script>
const frame = document.getElementById('preview')
const bundles = ${JSON.stringify(bundles)}
window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow) return
  const frameUrl = new URL(frame.src)
  if (event.data?.type === 'ginko:ready') {
    const locale = frameUrl.searchParams.get('locale')
    frame.contentWindow.postMessage({ type: 'ginko:preview', session: event.data.session, site: 'restaurant', locale, bundle: bundles[locale] }, frameUrl.origin)
  }
  if (event.data?.type === 'ginko:navigate') fetch('/__control/record', { method: 'POST', body: JSON.stringify(event.data) })
})
</script>`
}

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`)
  if (url.pathname === '/__control') { mode = url.searchParams.get('mode') ?? 'ok'; requests.length = 0; messages.length = 0; return res.end(mode) }
  if (url.pathname === '/__control/requests') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(requests)) }
  if (url.pathname === '/__control/messages') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(messages)) }
  if (url.pathname === '/__control/record' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    return req.on('end', () => { messages.push(JSON.parse(body)); res.end() })
  }
  if (url.pathname === '/__parent') {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    return res.end(parentPage(url.searchParams.get('src') ?? ''))
  }
  const match = url.pathname.match(/^\/bundle\/([a-z][a-z0-9-]*)$/)
  if (match) {
    requests.push({ site: match[1], locale: url.searchParams.get('locale'), minRev: url.searchParams.get('minRev') })
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('cache-control', 'no-store')
    if (mode === '503') { res.statusCode = 503; return res.end('{"code":"INTERNAL"}') }
    if (mode === 'hang') return
    if (mode === 'huge') { res.setHeader('content-type', 'application/json'); return res.end(`{"pad":"${'x'.repeat(9 * 1024 * 1024)}"}`) }
    const file = `${root}${match[1]}/bundle.format3.${url.searchParams.get('locale')}.json`
    if (!existsSync(file)) { res.statusCode = 404; return res.end('{"code":"SITE_NOT_FOUND"}') }
    res.setHeader('content-type', 'application/json')
    // `nofiles`: every image and file left out, as when uploads are missing (the hosted demo data has none).
    if (mode === 'nofiles') return res.end(JSON.stringify(withoutFiles(JSON.parse(readFileSync(file, 'utf8')))))
    // `proto`: a brick key `__proto__`, as a broken platform could send it (break-it 9).
    if (mode === 'proto') return res.end(readFileSync(file, 'utf8').replace(/"bricks":\s*\{/, '"bricks":{"__proto__":{"kind":"single","data":{},"fallback":[]},'))
    const bundle = JSON.parse(readFileSync(file, 'utf8'))
    // The lunch week is always the current one, as the owner would keep it (the corpus week is 2026-10-05).
    if (bundle.bricks.lunch?.data?.weekOf) bundle.bricks.lunch.data.weekOf = workWeekOf(todayIn('Europe/Vienna'), DEFAULT_WEEK)
    return res.end(JSON.stringify(bundle))
  }
  res.statusCode = 404
  res.end()
}).listen(port, () => console.log(`fake platform on ${port}`))
