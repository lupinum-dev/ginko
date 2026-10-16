// Synced from templates/_features/downloads/app/composables/useDownloads.ts by `pnpm templates sync`. Edit the source, not this copy.
/** What the downloads feature reads of a document: its file and, optionally, its language (`downloads()` of basics). */
export interface DownloadFacts {
  file: { name: string, size: number }
  language?: string | null
}

/**
 * The facts of a document in the page's language, for the list and for a link to one document elsewhere (a product
 * sheet): file type ("PDF"), size ("240 kB"), and the document's language when it is not the page's ("English" on the
 * German page; a document without one is in the site's main language), with its `hreflang` and media type.
 */
export function useDownloadText() {
  const { format, language } = useI18n('downloads')
  const { mainLocale } = useGinkoSite()
  const base = (tag: string) => tag.toLowerCase().split('-')[0]!
  /** The document's language as a BCP 47 tag (`en`, `de-AT`), or undefined. The field is free text: a word such as
   *  "Englisch" is no tag, so it never becomes an hreflang; it then shows as written. */
  const tagOf = (code: string | null | undefined) => (code && /^[a-z]{2,3}(-[a-z\d]{2,8})*$/i.test(code) ? code : undefined)
  /** `hreflang` of the link: the document's tag, the main language for a document without one, none for free text. */
  const hreflang = (doc: DownloadFacts) => tagOf(doc.language) ?? (doc.language ? undefined : mainLocale)
  /** The document's language by name in the page's language, or undefined when it is the page's own. */
  function languageName(doc: DownloadFacts): string | undefined {
    const code = doc.language
    if (code && !tagOf(code)) return code
    const tag = code || mainLocale
    if (base(tag) === base(language.value)) return undefined
    try {
      return new Intl.DisplayNames([language.value], { type: 'language' }).of(tag)
    } catch {
      return tag
    }
  }
  const type = (doc: DownloadFacts) => doc.file.name.split('.').at(-1)?.toUpperCase() ?? ''
  /** The media type for the link's `type`, from the file's extension; undefined for one this list does not know. */
  const mediaType = (doc: DownloadFacts) => MEDIA_TYPES[doc.file.name.split('.').at(-1)?.toLowerCase() ?? '']
  function size(doc: DownloadFacts) {
    const mb = doc.file.size / 1024 / 1024
    return mb >= 1
      ? format.number(mb, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 })
      : format.number(Math.max(1, Math.round(doc.file.size / 1024)), { style: 'unit', unit: 'kilobyte' })
  }
  return { type, size, languageName, hreflang, mediaType }
}

const MEDIA_TYPES: Partial<Record<string, string>> = {
  pdf: 'application/pdf',
  zip: 'application/zip',
  csv: 'text/csv',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
