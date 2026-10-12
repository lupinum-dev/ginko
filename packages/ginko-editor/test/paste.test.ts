// @vitest-environment happy-dom
// Paste: HTML from Word, Google Docs and web pages ends as clean Markdown for the field's profile.
// The fixtures in ./paste/ are small copies of what these sources put on the clipboard (styles, classes, comments,
// tracking images, fake lists, Google's redirect links). The table holds the expected Markdown, literally.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { components } from '@lupinum/ginko-components/registry'
import type { MarkdownProfile } from '@lupinum/ginko/internal'
import { describe, expect, test } from 'vitest'
import { createGinkoEditor, looksLikeMarkdown } from '../src/core/index.ts'

const fixture = (name: string) => readFileSync(join(import.meta.dirname, 'paste', name), 'utf8')

async function pasted(html: string, profile: MarkdownProfile): Promise<string> {
  const handle = await createGinkoEditor({ text: '', profile, components, element: document.createElement('div') })
  if (handle.mode !== 'rich') throw new Error('rich expected')
  handle.editor.view.pasteHTML(html)
  const markdown = await handle.markdown()
  handle.destroy()
  return markdown
}

const CASES: Array<{ name: string; file: string; profile: MarkdownProfile; markdown: string }> = [
  {
    name: 'Word, basic: fake lists become lists (also nested and numbered), the empty paragraphs and colours go',
    file: 'word.html',
    profile: 'basic',
    markdown: [
      '## Willkommen im Café',
      '',
      'Wir öffnen **täglich** um 9 Uhr und freuen uns auf *euren* Besuch.',
      '',
      '## Das gibt es bei uns',
      '',
      '- Frischen Kaffee',
      '- Selbst gebackenen Kuchen',
      '  - auch vegan',
      '- Ruhe zum Lesen',
      '',
      '1. Tisch reservieren',
      '2. Kommen und genießen',
      '',
      'Mehr Infos auf [unserer Seite](https://www.example.org/cafe).',
    ].join('\n'),
  },
  {
    name: 'Google Docs, basic: the wrapping <b> is not bold, bold and italic come from the spans, the redirect link is the real address',
    file: 'gdocs.html',
    profile: 'basic',
    markdown: [
      '## Unser Hofladen',
      '',
      'Bei uns gibt es **frisches Gemüse** und *Eier* vom Nachbarn.',
      '',
      '## Öffnungszeiten',
      '',
      '- Mittwoch bis Freitag, 14 bis 18 Uhr',
      '- Samstag, 9 bis 13 Uhr',
      '',
      'Bestellen per [E-Mail](mailto:hofladen@example.org).',
    ].join('\n'),
  },
  {
    name: 'web article, basic: h1 is the top level, quote and list stay, the tracking pixel, the button and the javascript: link go',
    file: 'web-article.html',
    profile: 'basic',
    markdown: [
      '## Warum Hecken wichtig sind',
      '',
      'von [Anna Keller](/autor/anna)',
      '',
      'Hecken sind **Lebensraum** für mehr als *tausend* Tierarten. [Mehr dazu hier](https://example.org/hecken?utm_source=newsletter).',
      '',
      '## So pflegst du sie',
      '',
      '> Eine Hecke ist mehr als ein Zaun.',
      '',
      '1. Im Herbst schneiden',
      '2. Laub liegen lassen',
      '',
      '### Werkzeug',
      '',
      'Du brauchst eine Schere und Geduld.',
      '',
      'schere --scharf',
      '',
      '---',
      '',
      'Böser Link',
    ].join('\n'),
  },
  {
    name: 'web article, rich: code stays code',
    file: 'web-article.html',
    profile: 'rich',
    markdown: [
      '## Warum Hecken wichtig sind',
      '',
      'von [Anna Keller](/autor/anna)',
      '',
      'Hecken sind **Lebensraum** für mehr als *tausend* Tierarten. [Mehr dazu hier](https://example.org/hecken?utm_source=newsletter).',
      '',
      '## So pflegst du sie',
      '',
      '> Eine Hecke ist mehr als ein Zaun.',
      '',
      '1. Im Herbst schneiden',
      '2. Laub liegen lassen',
      '',
      '### Werkzeug',
      '',
      'Du brauchst eine Schere und `Geduld`.',
      '',
      '```',
      'schere --scharf',
      '```',
      '',
      '---',
      '',
      'Böser Link',
    ].join('\n'),
  },
  {
    name: 'web table, rich: stays a table, without styles',
    file: 'web-with-table.html',
    profile: 'rich',
    markdown: [
      '## Preise',
      '',
      '| Sorte      | Preis  |',
      '| ---------- | ------ |',
      '| Äpfel      | 2,50 € |',
      '| **Birnen** | 3,10 € |',
      '',
      'Preise pro Kilo.',
    ].join('\n'),
  },
  {
    name: 'web table, basic: a paragraph per row, cells between " · "',
    file: 'web-with-table.html',
    profile: 'basic',
    markdown: ['## Preise', '', 'Sorte · Preis', '', 'Äpfel · 2,50 €', '', 'Birnen · 3,10 €', '', 'Preise pro Kilo.'].join('\n'),
  },
  {
    name: 'Word, inline: one run of text, a line break between the paragraphs, no lists or headings',
    file: 'word.html',
    profile: 'inline',
    markdown: [
      '**Willkommen im Café**  ',
      'Wir öffnen **täglich** um 9 Uhr und freuen uns auf *euren* Besuch.  ',
      '**Das gibt es bei uns**  ',
      'Frischen Kaffee  ',
      'Selbst gebackenen Kuchen  ',
      'auch vegan  ',
      'Ruhe zum Lesen  ',
      'Tisch reservieren  ',
      'Kommen und genießen  ',
      'Mehr Infos auf [unserer Seite](https://www.example.org/cafe).',
    ].join('\n'),
  },
]

describe('paste from Word, Google Docs and the web', () => {
  test.each(CASES)('$name', async ({ file, profile, markdown }) => {
    expect(await pasted(fixture(file), profile)).toBe(markdown)
  })
})

describe('looksLikeMarkdown', () => {
  test.each([
    ['## Titel\n\nText', true],
    ['- eins\n- zwei', true],
    ['Das ist **fett** gesagt', true],
    ['Ein [Link](https://example.org) hier', true],
    ['Ein ganz normaler Satz. Mit Komma, und Punkt.', false],
    ['Zwei Zeilen\nohne Syntax', false],
    ['snake_case_name und 2*3', false],
  ])('%j', (text, expected) => {
    expect(looksLikeMarkdown(text)).toBe(expected)
  })
})
