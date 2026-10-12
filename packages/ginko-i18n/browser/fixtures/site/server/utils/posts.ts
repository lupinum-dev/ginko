// A tiny "CMS": one entry, slugs per locale. "nur-hier" has no English version.
export const posts = [
  { id: 1, slugs: { de: 'hallo-welt', en: 'hello-world' }, title: { de: 'Hallo Welt', en: 'Hello world' } },
  { id: 2, slugs: { de: 'nur-hier' }, title: { de: 'Nur hier' } },
  { id: 3, slugs: { de: 'grüße', en: 'greetings' }, title: { de: 'Grüße', en: 'Greetings' } },
] as { id: number, slugs: Record<string, string>, title: Record<string, string> }[]
