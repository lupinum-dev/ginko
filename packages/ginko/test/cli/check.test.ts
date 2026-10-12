import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { main } from '../../src/cli/index.ts'
import { collection, defineSite, f } from '../../src/core/index.ts'

// One file brick (docs/<name>.md) with a route, and a home page that a link can point to.
const config = defineSite({
  site: 'linde', name: 'Linde', url: 'https://linde.example', timezone: 'Europe/Vienna',
  locales: ['de'], currency: 'EUR', pages: { home: '/' },
  bricks: {
    docs: collection({
      label: 'Doku', source: 'files', max: 50, order: 'manual',
      route: { de: '/doku/[slug]' },
      fields: { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }), body: f.markdown('Text') },
    }),
  },
})

/** A site folder: ginko.config.ts (a plain module, so the test needs no imports), content/ and public/. */
function siteWith(markdown: string) {
  const root = mkdtempSync(join(tmpdir(), 'ginko-check-'))
  const files: Record<string, string> = {
    'ginko.config.ts': `export default ${JSON.stringify(config)}\n`,
    'content/docs/einstieg.md':`---\ntitle: Einstieg\n---\n\n${markdown}\n`,
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return join(root, 'ginko.config.ts')
}

async function runCheck(configPath: string) {
  const lines: string[] = []
  const code = await main(['check', '--config', configPath], {
    env: {}, // a site of file bricks only needs no platform
    git: async () => '',
    stdout: () => undefined,
    log: (line) => lines.push(line),
    fetch: async () => { throw new Error('no platform call expected') },
  })
  return { code, lines }
}

describe('ginko check and links in content files', () => {
  it('reports a broken route link and exits 1', async () => {
    const { code, lines } = await runCheck(siteWith('Siehe [Nichts]($page.nope).'))
    expect(lines.filter((l) => l.startsWith('content/'))).toEqual([expect.stringContaining('content/docs/einstieg')])
    expect(lines.find((l) => l.startsWith('content/'))).toContain('$page.nope')
    expect(code).toBe(1)
  })

  it('prints no link lines for a clean file and exits 0', async () => {
    const { code, lines } = await runCheck(siteWith('Siehe [Start]($page.home).'))
    expect(lines).toEqual([])
    expect(code).toBe(0)
  })
})
