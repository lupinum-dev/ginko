// Messages for people (E8): every issue carries a catalog key and parameters, and the Studio can show it in English.
import { compileTree } from '@lupinum/ginko-i18n/compile'
import { describe, expect, it } from 'vitest'
import site from '../../../../sites/restaurant/ginko.config.ts'
import { compiledSource } from '../../scripts/compile-messages.ts'
import { coreCatalogs, coreMessage, defineComponents, f, fileProblem, parseMarkdown, serializeSchema, single, validate } from '../../src/core/index.ts'
import { compiled } from '../../src/core/messages.compiled.ts'

const schema = serializeSchema(site)
const menuEntry = (over: Record<string, unknown> = {}) => ({ category: 'mains', name: { de: 'Wiener Schnitzel' }, price: { amount: 1290 }, allergens: ['A'], veg: 'none', ...over })

describe('catalogs', () => {
  // Wrong behaviour caught: a key or parameter exists in one language only, so a person sees a German gap or an empty hole.
  it('have the same keys with the same parameters in every language', () => {
    const base = compileTree(coreCatalogs.de).params
    expect(Object.keys(base).length).toBeGreaterThan(80)
    for (const [locale, raw] of Object.entries(coreCatalogs)) {
      const params = compileTree(raw).params
      expect(Object.keys(params).sort(), locale).toEqual(Object.keys(base).sort())
      for (const [key, names] of Object.entries(base)) expect([...(params[key] ?? [])].sort(), `${locale} ${key}`).toEqual([...names].sort())
    }
  })

  // Wrong behaviour caught: someone edits a catalog and forgets `node packages/ginko/scripts/compile-messages.ts`, so core shows the old text.
  it('are compiled into src/core/messages.compiled.ts', () => {
    expect(compiledSource()).toContain(JSON.stringify(compiled, null, 1))
  })

  it('give an unknown language the German text', () => {
    expect(coreMessage('xx', 'issues.unknownField')).toBe('Unbekanntes Feld.')
    expect(coreMessage('en', 'issues.unknownField')).toBe('Unknown field.')
  })
})

describe('issues of validate', () => {
  // Wrong behaviour caught: the Studio gets a German sentence only and cannot translate "required field missing".
  it('a missing required field carries key and params, English on request', async () => {
    const { errors } = await validate(schema, 'menu', menuEntry({ price: undefined }), { mode: 'create' })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ path: 'price', code: 'REQUIRED', key: 'issues.fieldMissing', params: { label: expect.any(String) }, message: expect.stringContaining('fehlt.') })
    const { key, params } = errors[0]!
    expect(coreMessage('en', key, params)).toMatch(/^“.+” is missing\.$/)
  })

  it('a too-long text keeps the number as a parameter', async () => {
    const { errors } = await validate(schema, 'menu', menuEntry({ name: { de: 'x'.repeat(5000) } }), { mode: 'create' })
    const issue = errors.find((e) => e.code === 'TOO_LONG')!
    expect(issue.key).toBe('issues.tooLong')
    expect(coreMessage('en', issue.key, issue.params)).toMatch(/is too long \(at most \d+ characters\)\.$/)
    expect(issue.message).toMatch(/ist zu lang \(höchstens \d+ Zeichen\)\.$/)
  })
})

describe('file check', () => {
  const field = f.file('Karte', { accept: ['pdf'], maxBytes: 1.5 * 1024 * 1024 })
  // Wrong behaviour caught: the size limit shows as "1,5" in English, or the type error loses its list of allowed types.
  it.each([
    [{ size: 10, contentType: 'image/png' }, 'file.typeNotAllowed', 'This file type is not allowed (allowed: PDF).', 'Dieser Dateityp ist nicht erlaubt (erlaubt: PDF).'],
    [{ size: 3 * 1024 * 1024, contentType: 'application/pdf' }, 'file.tooBig', 'The file is too large (at most 1.5 MB).', 'Die Datei ist zu groß (höchstens 1,5 MB).'],
  ])('%j', (file, key, en, de) => {
    const problem = fileProblem(field, file)!
    expect(problem.key).toBe(key)
    expect(problem.message).toBe(de)
    expect(coreMessage('en', problem.key, problem.params)).toBe(en)
  })
})

describe('markdown and components', () => {
  const registry = defineComponents({
    callout: { kind: 'block', label: 'Hinweis', describe: 'x', props: { type: f.choice('Art', { options: ['info', 'warning'] }) } },
    tabs: { kind: 'block', label: 'Tabs', describe: 'x', props: {}, children: ['tab'] },
    tab: { kind: 'block', label: 'Tab', describe: 'x', props: {}, parents: ['tabs'] },
  })
  // Wrong behaviour caught: a nested part (the allowed profile, the property problem, "or") stays German in the English text.
  it.each([
    ['::nope\nx\n::', 'There is no component “nope”.'],
    ['::callout{type="danger"}\nx\n::', 'Component “callout”: property “type” has an invalid value (allowed: info, warning).'],
    ['::tab\nx\n::', 'Component “tab” may only appear in “tabs”.'],
    ['::tabs\n::callout{type="info"}\nx\n::\n::', 'Component “tabs” may only contain “tab”, not “callout”.'],
  ])('component problem of %j', async (text, en) => {
    const { problemMessages } = await parseMarkdown(text, { profile: 'page', components: registry })
    expect(problemMessages).toHaveLength(1)
    expect(coreMessage('en', problemMessages[0]!.key, problemMessages[0]!.params)).toBe(en)
  })

  it('a tag the profile does not allow names the profile in the language asked for', async () => {
    const { problems, problemMessages } = await parseMarkdown('# Titel', { profile: 'inline' })
    expect(problems).toEqual(['„h1“ ist hier nicht erlaubt (nur Text mit fett, kursiv, Code und Links).'])
    expect(coreMessage('en', problemMessages[0]!.key, problemMessages[0]!.params)).toBe('“h1” is not allowed here (only text with bold, italic, code and links).')
  })

  it('a markdown problem inside validate nests the problem in the issue', async () => {
    const own = serializeSchema({ ...site, bricks: { note: single({ label: 'Notiz', fields: { body: f.markdown('Text', { profile: 'inline' }) } }) } })
    const { errors } = await validate(own, 'note', { body: { de: '# Titel' } }, { mode: 'create' })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ code: 'MARKDOWN', key: 'issues.markdown', params: { label: 'Text', problem: { key: 'markdown.tagNotInProfile', params: { tag: 'h1' } } } })
    expect(coreMessage('en', errors[0]!.key, errors[0]!.params)).toBe('“Text”: “h1” is not allowed here (only text with bold, italic, code and links).')
  })
})
