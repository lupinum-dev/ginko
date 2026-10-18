import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { codeIconNames, collectIcons, contentIconNames, readIcon } from '../modules/icons'

const customDir = fileURLToPath(new URL('../icons', import.meta.url))
const pkgRoot = fileURLToPath(new URL('..', import.meta.url))
const roots = [pkgRoot]

const write = (base: string, files: Record<string, string>) => {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(base, name)), { recursive: true })
    writeFileSync(join(base, name), text)
  }
}

describe('icon names in code and content', () => {
  it('reads app.config and Vue files, and ignores comments and types', () => {
    expect(codeIconNames("social: [{ icon: 'docs:github', href: 'x' }]\nicon: string,\nicon?: string", 'app.config.ts')).toEqual(['docs:github'])
    expect(codeIconNames('<Icon name="lucide:x" /><Icon :name="\'tabler:home\'" />', 'A.vue')).toEqual(['lucide:x', 'tabler:home'])
    expect(codeIconNames('<Icon :name="icon" /><Card :icon="item" /><Card icon="lucide:star" data-icon="lucide:no" />', 'A.vue')).toEqual(['lucide:star'])
    expect(codeIconNames('<template><a>a // b</a><Icon name="lucide:y" /></template>', 'A.vue')).toEqual(['lucide:y'])
    expect(codeIconNames('<!-- <Icon name="lucide:old" /> -->\n// icon: "lucide:gone"\n/* icon: "lucide:gone2" */\nicon: "lucide:kept" // https://x', 'A.ts')).toEqual(['lucide:kept'])
  })

  it('reads Markdown front matter, component attributes and component blocks, not prose or code', () => {
    const md = [
      '---', 'icon: lucide:key-round', 'links:', '  - icon: book-open', '---',
      'Write icon: lucide:prose in a sentence, or `icon="lucide:inline"`.',
      '```md', '::card{icon="lucide:fenced"}', '```',
      '::card{icon="tabler:home" title="x"}', '::',
      '::card', '---', 'icon: lucide:block', '---', '::',
    ].join('\n')
    expect(contentIconNames(md, 'a.md')).toEqual(['lucide:key-round', 'lucide:book-open', 'tabler:home', 'lucide:block'])
    expect(contentIconNames('- icon: lucide:zap', 'nav.yml')).toEqual(['lucide:zap'])
  })
})

describe('readIcon', () => {
  it('reads an installed set and the docs brand logos; an unknown name gives nothing', () => {
    expect(readIcon('lucide:x', roots, customDir)?.[1]).toBe('0 0 24 24')
    expect(readIcon('docs:github', roots, customDir)?.[0]).toContain('<path')
    expect(readIcon('lucide:no-such-icon', roots, customDir)).toBeUndefined()
    expect(readIcon('nosuchset:x', roots, customDir)).toBeUndefined()
  })
})

describe('collectIcons', () => {
  it('assembles exactly the icons the layer, the site content and the site components use', () => {
    const base = mkdtempSync(join(tmpdir(), 'docs-icons-'))
    const layer = join(base, 'layer')
    const site = join(base, 'site')
    const logo = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>'
    write(layer, {
      'icons/github.svg': logo,
      'icons/discord.svg': logo,
      'app/components/Own.vue': "<template><DocsIcon name=\"lucide:search\" /></template>\n<script setup>\n// const unused = 'lucide:menu'\nconst a = 'docs:github'\n</script>",
    })
    write(site, {
      'content/docs/a.md': '---\nicon: lucide:rocket\n---\nProse icon: lucide:book mentions no icon.\n::card{icon="lucide:zap"}\n::\n',
      'content/docs/a.de.md': '---\nicon: lucide:rocket\n---\n',
      'content/home.yml': 'features:\n  - icon: lucide:shield\n  - icon: lucide:nope-not-here\n',
      'app/app.config.ts': "export default { docs: { social: [{ icon: 'docs:discord', href: 'x' }] } }",
      'app/components/Mine.vue': '<template><Icon name="lucide:check" /></template>\n<!-- <Icon name="lucide:trash" /> -->',
    })
    const { icons, warnings } = collectIcons({ layerRoot: layer, roots: [site, layer], resolveFrom: roots, relativeTo: site })
    expect(Object.keys(icons)).toEqual(['docs:discord', 'docs:github', 'lucide:check', 'lucide:rocket', 'lucide:search', 'lucide:shield', 'lucide:zap'])
    expect(warnings).toEqual(['Icon "lucide:nope-not-here" (content/home.yml) is not in an installed Iconify set; it renders nothing.'])
  })
})
