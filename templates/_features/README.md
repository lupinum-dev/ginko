# Template features

Shared sources of the templates in `templates/<name>/` (spec: ginko-internal `specs/TEMPLATES.md` §2, §3). A template
lists its features in `package.json` → `"ginko": { "features": [...] }`; `pnpm templates sync` copies the files each
feature's `files.json` lists into it (code files get a first line naming the source) and `pnpm templates sync --check`
fails on drift. Edit the files here, never the copies. Files not in `files.json` (this README, `e2e/`) stay here;
`e2e/*.spec.ts` run in gate 3 of every template that uses the feature.

| Feature | Brings | Needs in the template |
|---|---|---|
| `ui` | `DESIGN.md`, `components.json`, `app/assets/css/tokens.css`, `app/lib/utils.ts`, `app/components/ui/` (shadcn-vue: button, sheet) | packages `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`, `shadcn-nuxt`, `reka-ui`, `@vueuse/core`, `class-variance-authority`, `clsx`, `@lucide/vue`; `app/assets/css/main.css` that imports tailwindcss, tw-animate-css and `./tokens.css` and sets `--brand`, `--brand-foreground` (light and `.dark`) and `--font-body`; `seo.color` in `ginko.config.ts` equal to the light `--brand` (`sync --check` compares them); `shadcn: { prefix: '', componentDir: './app/components/ui' }` and the Tailwind Vite plugin in `nuxt.config.ts` |
| `site` | layout, header, phone nav sheet, footer, skip link, logo, theme toggle, language switch, notice bar, `/legal/<slug>` page, `error.vue`, `usePageSeo` (title, share card, JSON-LD), the blocks (Hero, PageHeader, Section, Cards, Features, Cta, Empty), `ProseBody`, `InitialsAvatar`, `telHref` (`app/utils/telHref.ts`), its texts in `i18n/site/`, `modules/feature-messages.ts`, `modules/page-paths.ts` (each Vue page's address per language from `ginko.config.ts`), `site-url.ts` | `ui`; bricks `site`, `legal` (route `localized('/legal/[slug]')`), `notices` from `@lupinum/ginko/basics` and a `home` page; `app/app.config.ts` with `site` (`SiteAppConfig`); `app/routes.ts` (`locales`, `localized`); modules `@lupinum/ginko/nuxt`, `@nuxt/fonts`, `@nuxtjs/color-mode` (`classSuffix: ''`), `nuxt-og-image` + `@takumi-rs/core`; `checkSiteUrl` in a `build:before` hook |
| `pages` | the `pages` brick (`app/bricks/pages.ts`) and the catch-all page `app/pages/[...slug].vue` | `site`; `pages: pages({ route: localized('/[slug]'), source: 'files' })`; content in `content/pages/` |
| `gallery` | `BlockGallery` (justified rows) and `SiteLightbox`, texts in `i18n/gallery/` | `ui`, `site`; the `gallery` brick from basics |
| `faq` | `BlockFaq` and the shadcn-vue accordion it is built on (`app/components/ui/accordion/`) | `ui`, `site`; the `faq` brick from basics; `faqJsonLd(items)` in the page's `usePageSeo({ jsonLd })` |
| `hours` | `HoursToday` (open now, today's times or the next opening), `HoursTable` (the week, coming hour plans, the public holiday rule, closures; prop `level` for its inner heading), `useHours`, `app/utils/hours.ts` (`spansLine`, `hoursNow` with spans past midnight, `plusDays`, `clockIn`), `site/FooterStatus.vue` (open now in the footer of every page), texts in `i18n/hours/` | `ui`, `site`; bricks `hours` and `hourPlans` (the gastro preset's `hours()` and `hourPlans()`, or basics'); `country` and `timeZone` in `ginko.config.ts` (public holidays, "today") |
| `menu` | the menu page (`/menu`, with category links, allergen key and VAT line), its print page (`/menu/print`, layout `print`), the lunch page (`/lunch`), `MenuDish`, `MenuDiet`, `MenuAllergens`, `MenuAllergenKey`, `MenuLunchDays`, `useMenu`, `useLunch`, texts in `i18n/menu/` | `ui`, `site`, **`hours`** (`useLunch` reads the opening hours, so a closed day shows no dish); bricks `menu` and `lunch` from `@lupinum/ginko-preset-gastro` (dishes are grouped by its `menuCategories`; allergens other than the EU letters show as written); pages `menu: translated('/menu')` and `lunch: translated('/lunch')`, so `path('menu')` and `path('lunch')` resolve; `currency` in `ginko.config.ts`; a translated page address needs its line in `slugs` of `app/routes.ts` (`/menu/print` too) |
| `events` | the events list (`/events`) and the event page (`/events/<slug>`) with Event JSON-LD in the site's time zone, `EventUpcoming` (the next events as a section of another page), `useEvents`, texts in `i18n/events/` | `ui`, `site`; the `events` brick (basics `events()` or the gastro preset's) with `route: translated('/events/[slug]')`; the page `events: translated('/events')`, so `path('events')` resolves; `currency` and `timeZone` in `ginko.config.ts` |
| `blog` | news list (`news/index.vue`, page key `news`; `?tag=` filters), post page (`news/[slug].vue`: date, authors with initials, cover 3:2, tags, BlogPosting JSON-LD), `BlogPostList`, `BlogByline`, `useBlogPosts`, the RSS feed per language at `<news page>/rss.xml` (`server/middleware/news-feed.ts`), texts in `i18n/blog/` | `site`; `posts({ authors: 'people', route })` from basics and a `people` brick; `pages.news`; drafts are `draft: true` in a file (never built) |
| `people` | team page (`team.vue`, page key `team`) with `PeopleList` (photo 4:5 or `InitialsAvatar`, role, bio, contact) and Person JSON-LD, texts in `i18n/people/`; a template's own `app/components/people/TeamContact.vue` shows between the page header and the people (the company: service line and office) | `site`; `people()` from basics; `pages.team` |
| `downloads` | documents page (`downloads.vue`, page key `downloads`) with `DownloadsList` (direct links, date, type and size, the document's language when it differs from the page's), `DownloadsFileButton` (one document by id as a button, for another feature's page), `useDownloadText`, texts in `i18n/downloads/` | `ui`, `site`; `downloads()` from basics as the brick `downloads`; `pages.downloads`; the files in `public/` |
| `projects` | the `projects` brick (`app/bricks/projects.ts`: title, slug, summary, image, `ends` for campaigns with `visible` until it, optional `gallery` ref, body; Today: campaigns ending within 7 days), list (`projects/index.vue`, page key `projects`) and project page, `useProjectCards`, texts in `i18n/projects/` | `site`; `projects({ route })`; `pages.projects` |
| `services` | the `services` brick (`app/bricks/services.ts`: title, slug, summary, `pricing` as an explicit choice of `price` or `onRequest`, `price` (money, in `currency`; required for a fixed price, so the build and the Studio refuse one without it), `duration` in minutes, `specs` (label and value rows), `contact` (the person of `people` who answers enquiries), image, body; with `downloads` a `sheet` ref to that brick), list (`services/index.vue`, page key `services`; cards with price and duration in tabular numbers) and service page (price, duration, key facts, an email with the title in the subject to the contact person or the business: "Ask for a date" for a fixed price, the enquiry for one on request, and their phone number, the product sheet through `DownloadsFileButton` when the template has the downloads feature, Service JSON-LD with an Offer only for a fixed price), `useServiceText`, `useServiceCards`, `useServiceJsonLd`, texts in `i18n/services/` | `ui`, `site`; `services({ route, downloads? })` and a `people` brick; `pages.services`; `currency` in `ginko.config.ts`; `vat` in `app.config.ts` (`site`) for "plus VAT" or "incl. VAT" on prices and in the JSON-LD |
| `jobs` | open jobs list (`jobs/index.vue`, page key `jobs`; with no open job an invitation to an open application) and job page (place, employment, work place, last day, the text, apply by email with the job title in the subject or the job's `applyUrl`; JobPosting JSON-LD with `validThrough`), `JobsList`, `useOpenJobs`, `useApplyLink`, `useJobJsonLd`, texts in `i18n/jobs/` | `ui`, `site`; `jobs({ route })` from basics (`validUntil` required: an expired job leaves list, page, sitemap and JSON-LD); `pages.jobs`; an email in `content/site.md` for jobs without `applyEmail` and for open applications |
| `logos-quotes` | the `logos` (name, image, url) and `quotes` (text, name, role; no photo) bricks (`app/bricks/logos-quotes.ts`), `BlockLogos` (one height, own widths) and `BlockQuote` | `site`; `logos()` and `quotes()` in `bricks`; the logo files in `public/` |

The brick wiring of the `site` feature in `ginko.config.ts`:

```ts
import { legal, notices, site } from '@lupinum/ginko/basics'
import { locales, localized } from './app/routes.ts'
import { siteUrl } from './site-url.ts'

export default defineSite({
  // …
  url: siteUrl('https://example.com'),
  locales,
  pages: { home: localized('/') },
  bricks: {
    notices: notices({ source: 'files' }),
    site: site({ source: 'files' }),
    legal: legal({ route: localized('/legal/[slug]'), source: 'files' }),
  },
})
```

A feature may add one thing to the shared footer: `app/components/site/FooterStatus.vue`. `SiteFooter` shows it at
the top of its contact column when the file exists (the hours feature brings it: open now). Only one feature per
template may bring it; `sync` refuses a file two features list.

Texts of shared components live in `i18n/<feature>/<code>.json` and are read as the namespace `<feature>`
(`useI18n('site')`); a template overrides one under the same key in its own `i18n/<code>.json`. A feature's texts and
its content in a language (`content/x/1.y.de.md`: a two-letter suffix, optionally with a region) are copied only into
templates that have that locale; main-language content (no suffix) always is. Content samples that differ per template
(`content/site.md`, notices, pages, the legal texts) belong to the template, not to a feature: the starter's
`content/legal/` holds the generic placeholders, a template for one country writes its own.

Feature pages keep their file name in every template (`news/index.vue`); the template gives the address per language
in `ginko.config.ts` (`pages.news: localized('/news')`, words per language in `app/routes.ts`), and
`modules/page-paths.ts` (site) applies it to the page. A feature page lists its page key in the table above.
