import { describe, expect, test } from 'vitest'
import {
  checkSchema, componentProblems, defineComponents, f, parseMarkdown, serializeSchema, single, validate,
  type ComponentRegistry,
} from '../../src/core/index.ts'

const registry = defineComponents({
  callout: {
    kind: 'block', label: 'Hinweis', describe: 'Hebt einen Absatz hervor.',
    props: { type: f.choice('Art', { options: ['info', 'warning'] }), title: f.text('Titel', { optional: true, max: 10 }) },
  },
  tabs: { kind: 'block', label: 'Tabs', describe: 'Gruppe von Tabs.', props: {}, children: ['tab'] },
  tab: { kind: 'block', label: 'Tab', describe: 'Ein Tab.', props: { title: f.text('Name') }, parents: ['tabs'] },
  card: { kind: 'block', label: 'Karte', describe: 'Karte mit Bereich.', props: {}, slots: { footer: { label: 'Fuß' } } },
  badge: { kind: 'inline', label: 'Badge', describe: 'Kleine Marke.', props: { size: f.number('Größe', { min: 1, max: 5, step: 1, optional: true }), solid: f.boolean('Gefüllt', { optional: true }), tags: f.choices('Tags', { options: ['a', 'b'], optional: true }) } },
})

describe('componentProblems', () => {
  const def = { kind: 'block', label: 'X', describe: 'x', props: {} } as const
  const cases: [string, ComponentRegistry, string][] = [
    ['tag not kebab-case', { Foo_Bar: def }, 'lower case'],
    ['blocked tag', { script: def }, 'is blocked'],
    ['shadows Markdown tag', { table: def }, 'belongs to Markdown'],
    ['prop type not allowed', { x: { ...def, props: { d: f.date('Datum') } } }, 'cannot have the type “date”'],
    ['unknown child', { x: { ...def, children: ['nope'] } }, 'children names “nope”'],
    ['unknown parent', { x: { ...def, parents: ['nope'] } }, 'parents names “nope”'],
    ['prop named onclick', { x: { ...def, props: { onclick: f.text('Klick') } } }, 'Invalid property name'],
    // A declared prop passes the attribute allowlist: `as` would mount another component, `innerHTML` writes markup.
    ['prop named as', { x: { ...def, props: { as: f.text('Als') } } }, 'Invalid property name “as”'],
    ['prop named innerHTML', { x: { ...def, props: { innerHTML: f.text('HTML') } } }, 'Invalid property name “innerHTML”'],
    // Labels follow the brick rule (labelProblem): the main language or English, no empty text.
    ['label without the main language or English', { x: { ...def, label: { fr: 'X' } } }, 'components.x.label: label needs a text in the main language “de” or in English.'],
    ['empty describe', { x: { ...def, describe: '' } }, 'components.x.describe: label is empty.'],
    ['editor.group with an invalid language', { x: { ...def, editor: { group: { de: 'G', EN_us: 'G' } } } }, 'components.x.editor.group: label has the invalid language “EN_us”.'],
  ]
  test.each(cases)('%s', (_name, reg, text) => {
    expect(componentProblems(reg, 'de').join('\n')).toContain(text)
  })
  test('a valid registry has no problems', () => expect(componentProblems(registry, 'de')).toEqual([]))
  test('children and parents may name plain Markdown tags', () => expect(componentProblems({ x: { ...def, children: ['pre'] } }, 'de')).toEqual([]))
  test('embed is blocked as an element but may be declared as a component', () => expect(componentProblems({ embed: def }, 'de')).toEqual([]))
})

describe('parseMarkdown with a component registry', () => {
  const cases: [string, string, string | null][] = [
    ['known component', '::callout{type="warning" title="Achtung"}\nText\n::', null],
    ['inline component', 'Das ist :badge[neu]{size="2" solid tags="a,b"} so.', null],
    ['nested children and parents', '::tabs\n::tab{title="Eins"}\nA\n::\n::', null],
    ['unknown tag', '::nope\nx\n::', 'Komponente „nope“ gibt es nicht.'],
    ['unknown prop', '::callout{type="info" color="red"}\nx\n::', 'Eigenschaft „color“ gibt es nicht'],
    ['bad choice', '::callout{type="danger"}\nx\n::', 'Eigenschaft „type“ hat einen ungültigen Wert'],
    ['missing required prop', '::callout\nx\n::', 'Eigenschaft „type“ fehlt'],
    ['text too long', '::callout{type="info" title="Viel zu langer Titel"}\nx\n::', 'Eigenschaft „title“ ist zu lang'],
    ['number out of range', ':badge[x]{size="9"}', 'Eigenschaft „size“ muss zwischen 1 und 5'],
    ['bound number', ':badge[x]{:size="3"}', null],
    ['not a number', ':badge[x]{size="viel"}', 'Eigenschaft „size“ muss eine Zahl sein'],
    ['bad boolean', ':badge[x]{solid="vielleicht"}', 'Eigenschaft „solid“ muss „true“ oder „false“'],
    ['bad choices value', ':badge[x]{tags="a,z"}', 'Eigenschaft „tags“ hat ungültige Werte'],
    ['tab outside tabs', '::tab{title="x"}\nA\n::', 'darf nur in „tabs“ stehen'],
    ['wrong child in tabs', '::tabs\n::callout{type="info"}\nx\n::\n::', 'darf nur „tab“ enthalten, nicht „callout“'],
    ['block component written inline', 'Text :callout{type="info"} mehr', 'ist ein Block und gehört nicht in einen Absatz'],
    ['declared slot', '::card\n#footer\nUnten\n::', null],
    ['undeclared slot', '::card\n#header\nOben\n::', 'Der Bereich „header“ gibt es nicht'],
    ['slot on a component without slots', '::callout{type="info"}\n#footer\nx\n::', 'hat keine Bereiche'],
    ['template outside a registered component', '::nope\n#footer\nx\n::', '„template“ ist nicht erlaubt.'],
    ['blocked tag stays blocked', '::script\nx\n::', '„script“ ist nicht erlaubt.'],
    // An unclosed block swallows the rest of its parent; inside a list item comark re-reads the indented lines.
    ['unclosed component in a list item', '- Punkt\n\n  ::callout{type="info"}\n  x\n- Zwei\n\nDanach', 'Die Komponente „callout“ ist nicht geschlossen'],
    ['closed component in a list item', '- Punkt\n\n  ::callout{type="info"}\n  x\n  ::\n- Zwei', null],
    ['closed component in a quote', '> ::callout{type="info"}\n> x\n> ::\n\nDanach', null],
    ['plain Markdown is not a component','# Titel\n\n| a |\n|---|\n| b |\n\n- x', null],
  ]
  test.each(cases)('%s', async (_name, text, problem) => {
    const { problems } = await parseMarkdown(text, { profile: 'page', components: registry })
    if (problem === null) expect(problems).toEqual([])
    else expect(problems.join('\n')).toContain(problem)
  })

  test('without a registry any tag except the blocked ones is accepted, with the global attributes only', async () => {
    expect((await parseMarkdown('::nope{lang="en" aria-label="Box"}\nx\n::', { profile: 'page' })).problems).toEqual([])
    expect((await parseMarkdown('::nope{a="1"}\nx\n::', { profile: 'page' })).problems).toEqual(['Die Eigenschaft „a“ ist nicht erlaubt.'])
    expect((await parseMarkdown('::script\nx\n::', { profile: 'page' })).problems).toEqual(['„script“ ist nicht erlaubt.'])
    expect((await parseMarkdown('::card\n#footer\nx\n::', { profile: 'page' })).problems).toEqual(['„template“ ist nicht erlaubt.'])
  })

  test('embed passes only where the registry declares it', async () => {
    const withEmbed = { ...registry, embed: { kind: 'block', label: 'Embed', describe: 'x', props: { src: f.text('Adresse') } } } as const
    const text = '::embed{src="https://example.org/map"}\n::'
    expect((await parseMarkdown(text, { profile: 'page', components: withEmbed })).problems).toEqual([])
    expect((await parseMarkdown(text, { profile: 'page', components: registry })).problems).toEqual(['„embed“ ist nicht erlaubt.'])
    expect((await parseMarkdown(text, { profile: 'page' })).problems).toEqual(['„embed“ ist nicht erlaubt.'])
  })

  test('the registry is ignored below the page profile', async () => {
    const { problems } = await parseMarkdown(':badge[x]', { profile: 'rich', components: registry })
    expect(problems.join()).toContain('„badge“ ist hier nicht erlaubt')
  })
})

describe('component registry in the schema', () => {
  const site = {
    site: 'demo', name: 'Demo', url: 'https://demo.test', timeZone: 'Europe/Vienna', locales: ['de'] as const, currency: 'EUR' as const,
    pages: { home: '/' },
    bricks: { page: single({ label: 'Seite', fields: { body: f.markdown('Text', { profile: 'page' }) } }) },
  }

  test('validate rejects an unknown component in a markdown field', async () => {
    const schema = serializeSchema({ ...site, components: registry })
    expect(checkSchema(schema)).toEqual([])
    const ok = await validate(schema, 'page', { body: { de: '::callout{type="info"}\nHi\n::' } }, { mode: 'release' })
    expect(ok.errors).toEqual([])
    const bad = await validate(schema, 'page', { body: { de: '::nope\nHi\n::' } }, { mode: 'release' })
    expect(bad.errors.map((e) => e.message)).toEqual(['„Text“: Komponente „nope“ gibt es nicht.'])
  })

  test('a schema without components is unchanged and keeps accepting any tag', async () => {
    const schema = serializeSchema(site)
    expect('components' in schema).toBe(false)
    const result = await validate(schema, 'page', { body: { de: '::nope\nHi\n::' } }, { mode: 'release' })
    expect(result.errors).toEqual([])
  })

  test('checkSchema reports registry problems', () => {
    const schema = serializeSchema({ ...site, components: { table: { kind: 'block', label: 'T', describe: 't', props: { r: f.ref('R', { to: 'missing' }) } } } })
    const problems = checkSchema(schema).join('\n')
    expect(problems).toContain('belongs to Markdown')
    expect(problems).toContain('components.table.props.r: to must name a collection')
  })
})
