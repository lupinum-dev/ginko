// The records of the site search: one per heading section of every collection item with a URL. Build side only
// (the bundle, Markdown trees); the browser reaches the engine in search.ts without this file.
import { entryTitle, type Bundle } from './bundle.ts'
import { factResolver } from './facts.ts'
import { textBlocks, type MarkdownTree } from './markdown.ts'
import { isVisible } from './resolve.ts'
import type { SearchRecord } from './search.ts'
import type { Schema } from './types.ts'

export interface SearchSectionsOptions {
  /** Tells which fields are markdown and text. */
  schema: Pick<Schema, 'bricks'>
  /** The trees behind `{ ref }` markdown values (withMarkdownRefs); not needed when the bundle holds the trees. */
  trees?: ReadonlyMap<string, MarkdownTree>
  /** The site's day (`todayIn`): entries past their `visible` date are left out, as on the pages. Unset at build time, where the day is not known. */
  today?: string
  /** BCP 47 tag for the text of facts (numbers, money, dates); default: the bundle's locale. */
  language?: string
}

const treeOf = (value: unknown, trees?: ReadonlyMap<string, MarkdownTree>): MarkdownTree | undefined => {
  if (typeof value !== 'object' || value === null) return undefined
  if ('nodes' in value) return value as MarkdownTree
  const ref = (value as { ref?: unknown }).ref
  return typeof ref === 'string' ? trees?.get(ref) : undefined
}

/** Characters of a hit's excerpt; the index ships to every visitor, so it stays short. */
const EXCERPT = 140
const excerptOf = (text: string) => {
  const flat = text.replace(/\s+/g, ' ')
  return flat.length <= EXCERPT ? flat : `${flat.slice(0, flat.lastIndexOf(' ', EXCERPT) + 1 || EXCERPT).trimEnd()}…`
}

const collapse = (text: string) => text.replace(/[ \t]*\n[ \t\n]*/g, '\n').replace(/[ \t]+/g, ' ').trim()

/**
 * The search records of one locale's bundle: for every collection item with a URL in that locale, one record
 * for the text before the first h2 and one per h2/h3 section. Longtext fields (a description, a summary) count as text of the first record; short text fields are labels (an icon name, a badge), not content.
 */
export function searchSections(bundle: Bundle, options: SearchSectionsOptions): SearchRecord[] {
  const records: SearchRecord[] = []
  // A fact in a text is found by its value ("98 €"), as the page shows it.
  const resolve = factResolver({ bricks: options.schema.bricks, data: bundle.bricks, locale: bundle.locale, mainLocale: bundle.mainLocale, language: options.language ?? bundle.locale, ...(options.today ? { today: options.today } : {}) })
  for (const [brick, entry] of Object.entries(bundle.bricks)) {
    if (entry.kind !== 'collection') continue
    const def = options.schema.bricks[brick]
    const fields = Object.entries(def?.fields ?? {})
    for (const item of entry.items) {
      const url = item.urls?.[bundle.locale]
      if (!url) continue
      if (def && options.today && !isVisible(def, item.data, options.today)) continue
      const title = entryTitle(item, def?.fields)
      const intro: string[] = []
      for (const [name, field] of fields) {
        const value = item.data[name]
        if (field.type === 'longtext' && typeof value === 'string') intro.push(value)
      }
      const sections: { heading?: string; id?: string; parts: string[] }[] = [{ parts: intro }]
      for (const [name, field] of fields) {
        if (field.type !== 'markdown') continue
        for (const block of textBlocks(treeOf(item.data[name], options.trees)?.nodes ?? [], resolve)) {
          if (block.heading) sections.push({ heading: collapse(block.text), ...(block.heading.id ? { id: block.heading.id } : {}), parts: [] })
          else sections[sections.length - 1]!.parts.push(block.text)
        }
      }
      // An empty intro is left out (its title is found through the sections), unless the item has no sections at all.
      for (const [i, section] of sections.entries()) {
        const text = collapse(section.parts.join('\n'))
        if (i === 0 && !text && sections.length > 1) continue
        const record: SearchRecord = {
          // A heading without an anchor (one in Arabic script: its slug keeps no letter) still needs its own id, so
          // the engine never sees one twice; its hit opens the page at the top.
          id: section.id ? `${item.id}#${section.id}` : i === 0 ? item.id : `${item.id}#${i}`,
          url: section.id ? `${url}#${section.id}` : url,
          title,
          text,
          excerpt: excerptOf(text),
          brick,
          locale: bundle.locale,
        }
        if (section.heading) record.heading = section.heading
        records.push(record)
      }
    }
  }
  return records
}
