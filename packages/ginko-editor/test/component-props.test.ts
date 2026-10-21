// @vitest-environment happy-dom
// Reading, writing and checking the props of a component block, headless.
import { components } from '@lupinum/ginko-components/registry'
import { f } from '@lupinum/ginko'
import { defineComponents, labelOf, parseMarkdown, type ComponentRegistry } from '@lupinum/ginko/internal'
import { describe, expect, test } from 'vitest'
import { createGinkoEditor, missingRequired, propProblem, blockSummary, readProp, slashItems, writeProp, type InsertedComponent, type PropField } from '../src/index.ts'

const registry: ComponentRegistry = {
  ...components,
  ...defineComponents({
    box: {
      kind: 'block',
      label: 'Kasten',
      describe: 'Ein Kasten.',
      props: { tags: f.choices('Marken', { options: ['a', 'b', 'c'], max: 2 }), href: f.text('Adresse', { format: 'url', max: 100 }) },
      editor: { example: '::box\nText\n::' },
    },
  }),
}
const field = (tag: string, key: string) => registry[tag]!.props[key] as PropField

describe('propProblem', () => {
  // The message must be the one parseMarkdown gives for the same attribute, after the label of the prop.
  const cases: Array<[tag: string, key: string, value: string | number | string[], attribute: string]> = [
    ['dropcap', 'lines', 9, '9'],
    ['dropcap', 'lines', 2.5, '2.5'],
    ['callout', 'type', 'kaputt', 'kaputt'],
    ['callout', 'title', 'x'.repeat(121), 'x'.repeat(121)],
    ['box', 'tags', ['a', 'a'], 'a,a'],
    ['box', 'tags', ['a', 'b', 'c'], 'a,b,c'],
    ['box', 'tags', ['z'], 'z'],
    ['tab', 'title', '', ''],
    ['card', 'image', 'javascript:alert(1)', 'javascript:alert(1)'],
  ]
  test.each(cases)('%s %s %j gives the message of parseMarkdown', async (tag, key, value, attribute) => {
    // A tab only parses inside tabs; the check of the prop does not depend on that.
    const block = `::${tag}{${key}="${attribute}"}\n::`
    const parsed = await parseMarkdown(tag === 'tab' ? `:::tabs\n${block}\n:::` : block, { profile: 'page', components: registry })
    const marker = `Eigenschaft „${key}“ `
    const core = parsed.problems.map((p) => p.slice(p.indexOf(marker) + marker.length)).find((_, i) => parsed.problems[i]!.includes(marker))
    expect(core).toBeDefined()
    expect(propProblem(registry, tag, key, value)).toBe(`${labelOf(field(tag, key).label, "en", "de")} ${core}`)
  })

  test.each([
    ['dropcap', 'lines', 3],
    ['callout', 'type', 'warning'],
    ['callout', 'title', undefined],
    ['box', 'tags', ['a', 'b']],
    ['box', 'href', 'https://example.org/x'],
    ['box', 'href', '/seite#teil'],
  ] as const)('%s %s %j is fine', (tag, key, value) => {
    expect(propProblem(registry, tag, key, value as never)).toBeUndefined()
  })

  test('an address that is not safe is refused with the core message, a required prop without value is named', () => {
    expect(propProblem(registry, 'box', 'href', 'javascript:alert(1)')).toBe('Link ist nicht erlaubt (nur http, https, mailto, tel oder /pfad).')
    expect(propProblem(registry, 'box', 'href', undefined)).toBe('Adresse fehlt.')
    expect(propProblem(registry, 'box', 'href', '')).toBe('Adresse ist leer.')
  })

  test('missingRequired lists the required props that have no valid value', () => {
    expect(missingRequired(registry, 'box', { href: 'https://example.org' })).toEqual(['tags'])
    expect(missingRequired(registry, 'box', {})).toEqual(['tags', 'href'])
    expect(missingRequired(registry, 'callout', {})).toEqual([])
  })
})

describe('writeProp', () => {
  test('a changed prop keeps its place, the others stay as they are', () => {
    expect(writeProp(field('callout', 'type'), { type: 'info', title: 'A' }, 'type', 'warning')).toEqual({ type: 'warning', title: 'A' })
    expect(Object.keys(writeProp(field('callout', 'type'), { title: 'A', type: 'info' }, 'type', 'warning'))).toEqual(['title', 'type'])
  })

  test('an empty optional value removes the prop; the bound form of a name is kept', () => {
    expect(writeProp(field('callout', 'title'), { type: 'info', title: 'A' }, 'title', undefined)).toEqual({ type: 'info' })
    expect(writeProp(field('dropcap', 'lines'), { ':lines': '3' }, 'lines', 4)).toEqual({ ':lines': '4' })
  })

  test('a boolean is written bare when on and left out when off; a default of true is left out when on', () => {
    expect(writeProp(field('collapse', 'open'), { title: 'x' }, 'open', true)).toEqual({ title: 'x', ':open': 'true' })
    expect(writeProp(field('collapse', 'open'), { title: 'x', ':open': 'true' }, 'open', false)).toEqual({ title: 'x' })
    expect(writeProp(field('figure', 'zoom'), { src: '/a.svg' }, 'zoom', false)).toEqual({ src: '/a.svg', zoom: 'false' })
    expect(writeProp(field('figure', 'zoom'), { src: '/a.svg', zoom: 'false' }, 'zoom', true)).toEqual({ src: '/a.svg' })
  })

  test('readProp reads what writeProp wrote, in the form a field shows', () => {
    expect(readProp(field('dropcap', 'lines'), { lines: '3' }, 'lines')).toBe(3)
    expect(readProp(field('box', 'tags'), { tags: 'a, b' }, 'tags')).toEqual(['a', 'b'])
    expect(readProp(field('collapse', 'open'), { ':open': 'true' }, 'open')).toBe(true)
    expect(readProp(field('figure', 'zoom'), {}, 'zoom')).toBe(true)
    expect(readProp(field('callout', 'title'), {}, 'title')).toBeUndefined()
  })

  test('an edited block is saved as Markdown with only that block changed', async () => {
    const text = 'Davor  *so*\n\n::callout{type="info" title="A"}\nText\n::\n\n::collapse{title="Mehr" open}\nInhalt\n::\n'
    const handle = await createGinkoEditor({ text, profile: 'page', components: registry, element: document.createElement('div') })
    if (handle.mode !== 'rich') throw new Error(handle.problems.join())
    const { editor } = handle
    const edit = (tag: string, key: string, value: Parameters<typeof writeProp>[3]) => {
      let done = false
      editor.state.doc.descendants((node, pos) => {
        if (done || node.type.name !== 'component' || node.attrs.tag !== tag) return
        done = true
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, props: writeProp(field(tag, key), node.attrs.props, key, value) }))
      })
    }
    edit('callout', 'type', 'warning')
    expect(await handle.markdown()).toBe('Davor  *so*\n\n::callout{type="warning" title="A"}\nText\n::\n\n::collapse{title="Mehr" open}\nInhalt\n::\n')
    edit('collapse', 'open', false)
    expect(await handle.markdown()).toBe('Davor  *so*\n\n::callout{type="warning" title="A"}\nText\n::\n\n::collapse{title="Mehr"}\nInhalt\n::\n')
  })
})

describe('slash insert of a component', () => {
  async function inserted(tag: string) {
    const handle = await createGinkoEditor({ text: '', profile: 'page', components: registry, element: document.createElement('div') })
    if (handle.mode !== 'rich') throw new Error(handle.problems.join())
    const calls: InsertedComponent[] = []
    await slashItems({ profile: 'page', components: registry, onNeedsProps: (info) => calls.push(info) }).find((i) => i.id === `component:${tag}`)!.run(handle.editor)
    return { calls, editor: handle.editor }
  }

  test('reports the required props the example leaves empty, with the position of the block', async () => {
    const { calls, editor } = await inserted('box')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ tag: 'box', missing: ['tags', 'href'] })
    expect(editor.state.doc.nodeAt(calls[0]!.pos)?.attrs.tag).toBe('box')
  })

  test('reports nothing when the example fills them', async () => {
    expect((await inserted('read-more')).calls).toEqual([])
    expect((await inserted('callout')).calls).toEqual([])
  })
})

describe('blockSummary', () => {
  const label = (l: string | Record<string, string>) => (typeof l === 'string' ? l : l.de!)
  const figure = {
    props: {
      src: f.image('Bild'), alt: f.text('Bildbeschreibung'), caption: f.text('Bildunterschrift', { optional: true }),
      width: f.number('Breite in Pixeln', { min: 1, max: 10000, step: 1, optional: true }), bleed: f.boolean('Breiter als der Text', { optional: true }),
      aspect: f.choice('Seitenverhältnis', { options: [{ value: 'auto', label: 'Original' }, { value: 'square', label: { de: 'Quadrat', en: 'Square' } }], optional: true, default: 'auto' }),
    },
  }
  const files = (id: string) => (id === 'k57x' ? 'hund.webp' : undefined)

  // Wrong behaviour caught: the card printed every prop in storage order ("Breite in Pixeln: 2756 · …"), so the
  // caption and the picture's name were cut off, and a library picture showed its ID.
  test.each([
    ['caption first, the description under the picture, choices in words, no sizes or switches',
      { src: '$file.k57x', alt: 'Ein Hund', caption: 'Bello im Garten', width: '2756', ':bleed': 'true', aspect: 'square' },
      { title: 'Bello im Garten', facts: ['Quadrat'], pictures: [{ key: 'src', src: '$file.k57x', file: 'k57x', note: 'Ein Hund' }] }],
    ['only a description: it is the title, the file name goes under the picture',
      { src: '$file.k57x', alt: 'Ein Hund', aspect: 'auto' },
      { title: 'Ein Hund', facts: [], pictures: [{ key: 'src', src: '$file.k57x', file: 'k57x', note: 'hund.webp' }] }],
    ['only a web address: its file name is the title',
      { src: 'https://example.org/fotos/garten.jpg?w=800' },
      { title: 'garten.jpg', facts: [], pictures: [{ key: 'src', src: 'https://example.org/fotos/garten.jpg?w=800' }] }],
    ['a library picture whose name is still loading: no title yet',
      { src: '$file.zz' },
      { facts: [], pictures: [{ key: 'src', src: '$file.zz', file: 'zz' }] }],
  ])('%s', (_name, props, expected) => {
    expect(blockSummary(props, figure, { label, fileName: files })).toEqual(expected)
  })

  test('a long title is cut; a block without registry entry takes its title prop', () => {
    expect(blockSummary({ title: 'x'.repeat(100) }, undefined, { label }).title).toBe(`${'x'.repeat(79)}…`)
  })
})
