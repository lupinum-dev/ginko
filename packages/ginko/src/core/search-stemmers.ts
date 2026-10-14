// Every stemmer at once, imported statically: for a runtime that cannot load a chunk later. A Convex query is one
// (its bundle is split into chunks, and `import()` throws there). The browser loads only the stemmer it needs: search.ts.
import { stemmer as dutch } from '@zbsearch/stemmers/dutch'
import { stemmer as english } from '@zbsearch/stemmers/english'
import { stemmer as french } from '@zbsearch/stemmers/french'
import { stemmer as german } from '@zbsearch/stemmers/german'
import { stemmer as italian } from '@zbsearch/stemmers/italian'
import { stemmer as portuguese } from '@zbsearch/stemmers/portuguese'
import { stemmer as spanish } from '@zbsearch/stemmers/spanish'
import { stemmedLanguage, type StemmedLanguage, type Stemmer } from './search.ts'

// The same languages as the lazy list in search.ts: the type check fails when one list gains a language.
const loaded = { de: german, en: english, es: spanish, fr: french, it: italian, nl: dutch, pt: portuguese } satisfies Record<StemmedLanguage, Stemmer>

/** The stemmer of a locale code (`pt-BR` → Portuguese), without loading anything; no stemming for other languages. */
export function stemmerNow(language: string): Stemmer {
  const code = stemmedLanguage(language)
  return code ? loaded[code] : (word) => word
}
