# @lupinum/ginko-preset-agency

> Internal: this package is not published to npm yet. Its options will first match `@lupinum/ginko-preset-gastro`.

The content types an agency or studio website needs, for [Ginko](https://github.com/lupinum-dev/ginko) sites.
Declare them in one line each instead of writing the collections by hand.

| Factory | Content | Detail page (de / en) |
|---|---|---|
| `services()` | Services | `/leistungen/[slug]`, `/en/services/[slug]` |
| `caseStudies()` | Case studies | `/referenzen/[slug]`, `/en/case-studies/[slug]` |
| `blog()` | Blog posts | `/blog/[slug]`, `/en/blog/[slug]` |
| `authors()` | Authors | none |
| `legal()` | Imprint, privacy, terms (with `updatedAt`) | `/[slug]`, `/en/[slug]` |
| `faq()` | Questions and answers | none |
| `team()` | People: name, role, photo, bio, order | none |
| `jobs()` | Job posts, hidden after `validUntil` | `/karriere/[slug]`, `/en/careers/[slug]` |
| `company()` | Company details (one entry): legal name, address, email, phone, register data | none |

By default the content comes from Markdown files (`source: 'files'`). The key in `bricks` is the folder name
under `content/`, so `leistungen: services()` reads `content/leistungen/`. `company()` is one entry, so it reads
`content/<key>.yml` (and `content/<key>.en.yml`).

```ts
// ginko.config.ts
import { defineSite, f } from '@lupinum/ginko'
import { authors, blog, caseStudies, company, faq, jobs, legal, services, team } from '@lupinum/ginko-preset-agency'

export default defineSite({
  site: 'studio',
  name: 'Studio',
  url: 'https://example.com',
  timeZone: 'Europe/Vienna',
  locales: ['de', 'en'],
  currency: 'EUR',
  pages: { home: { de: '/', en: '/en' } },
  bricks: {
    services: services(),
    caseStudies: caseStudies(),
    blog: blog(),
    authors: authors(),
    legal: legal(),
    faq: faq(),
    team: team(),
    jobs: jobs(),
    company: company(),
  },
})
```

## Options

Every factory takes:

- Labels are always German and English.
- `label`, `fieldLabels`: rename the brick or single fields, as text or `{ de, en }` (`{ outcome: { de: 'Wirkung', en: 'Impact' } }`).
- `source`: `'files'` (default) or `'platform'`. `max`: most entries (not for `company()`).
- `extra`: your own fields, merged after the preset's. A field with the same name replaces the preset's.
- `body`: options for the main Markdown text, e.g. `{ profile: 'page', max: 100_000 }` when the site has its own components (not for `company()`).

Bricks with a detail page also take `route`, one path per language with `[slug]`. A language you leave out keeps the default.

```ts
leistungen: services({ route: { de: '/angebot/[slug]' }, extra: { color: f.text('Farbe', { optional: true }) } }),
faq: faq({ extra: { topic: f.choice('Thema', { options: ['Kosten', 'Ablauf'], optional: true }) } }),
```

Relations use the `ref` field type. A reference to a file entry is written as `<brick>/<file name>`, for example
`author: authors/jane`.

- `blog({ authorsBrick })`: key of the authors brick (default `authors`); `false` removes the `author` field. A post
  has no reading time field: compute it from the text, e.g. `Math.max(1, Math.round((wordsOf(post.data.body) ?? 0) / 200))`
  with `wordsOf` from `@lupinum/ginko`. The `write` task starts a new post with today's date.
- `caseStudies({ categories })`: `categories` replaces the work areas (`serviceCategories`), the one field that says
  which of your services a case study belongs to. `services` are free tags for the overview.
- `legal({ types })`: replaces the kinds of legal page.
- `authors()` and `team()` have a detail page only when you pass `route` (`team` then needs a `slug` field in `extra`).

## Company details

`company()` holds the data an imprint, a contact box and the footer need, so the owner changes it in one place.
Every field is optional, so the brick can join a site that is already live. One task, "Firmendaten ändern", covers
every field, also those you add with `extra` (e.g. a `region`). Name, address, register number and VAT ID are the
same in every language; `country` and `registryCourt` are translated. `telHref(phone)` makes the `tel:` link target:
it keeps a leading `+` and drops everything else that is not a digit.

```ts
firma: company({ source: 'platform', extra: { region: f.text('Region', { optional: true, translate: false }) } }),
```

```vue
<a v-if="firma.phone" :href="`tel:${telHref(firma.phone)}`">{{ firma.phone }}</a>
```

## Jobs

Jobs have a title, location, employment type, work place (on site, hybrid, remote), a Markdown description,
`applyUrl` or `applyEmail`, and `validUntil`. A job is open through the day of `validUntil`. Lists leave expired jobs out by
themselves; `openJobs(items, today)` applies the same rule in your own code. `today` is `YYYY-MM-DD` in the site's time zone.

## License

MIT © Lupinum OG
