import { describe, expect, it } from 'vitest'
// The parser that turns a ```md preview fence into the `example` node, as the file build does.
import { parseFile } from '../../ginko-content/src/markdown.ts'
import { previewToc } from '../app/lib/previewToc'

describe('previewToc', () => {
  it('gives an inline-toc inside a ```md preview the preview\'s own headings', async () => {
    const fence = '````md preview\n::inline-toc\n::\n\n## Install\n\n### With npm\n\n## Use `it`\n````'
    const { value } = await parseFile(`Intro\n\n${fence}\n`)
    const example = value.nodes.find((n) => Array.isArray(n) && n[0] === 'example') as [string, { preview: unknown[] }]
    expect(previewToc(example[1].preview)).toEqual({ links: [
      { id: 'install', depth: 2, text: 'Install', children: [{ id: 'install-with-npm', depth: 3, text: 'With npm' }] },
      { id: 'use-it', depth: 2, text: 'Use it' },
    ] })
  })
})
