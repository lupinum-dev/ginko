# Template features

Shared sources of the templates in `templates/<name>/` (spec: ginko-internal `specs/TEMPLATES.md` §2, §3). A template
lists its features in `package.json` → `"ginko": { "features": [...] }`; `pnpm templates sync` copies the files each
feature's `files.json` lists into it (code files get a first line naming the source) and `pnpm templates sync --check`
fails on drift. Edit the files here, never the copies. Files not in `files.json` (this README, `e2e/`) stay here;
`e2e/*.spec.ts` run in gate 3 of every template that uses the feature.

| Feature | Brings | Needs in the template |
|---|---|---|
| `ui` | `DESIGN.md`, `components.json`, `app/assets/css/tokens.css`, `app/lib/utils.ts`, `app/components/ui/` (shadcn-vue: button, sheet) | packages `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`, `shadcn-nuxt`, `reka-ui`, `@vueuse/core`, `class-variance-authority`, `clsx`, `@lucide/vue`; `app/assets/css/main.css` that imports tailwindcss, tw-animate-css and `./tokens.css` and sets `--brand`, `--brand-foreground` (light and `.dark`) and `--font-body`; `seo.color` in `ginko.config.ts` equal to the light `--brand` (`sync --check` compares them); `shadcn: { prefix: '', componentDir: './app/components/ui' }` and the Tailwind Vite plugin in `nuxt.config.ts` |
| `site` | layout, header, phone nav sheet, footer, `SiteContact` (email, phone and address as links), skip link, logo, theme toggle, language switch, notice bar, `/legal/<slug>` page, `error.vue`, `usePageSeo` (title, share card, JSON-LD), the blocks (Hero, PageHeader, Section, Cards, Features, Cta, Empty), `ProseBody`, `InitialsAvatar`, its texts in `i18n/site/`, `app/utils/telHref.ts` (the one `tel:` link helper), `server/plugins/font-preload.ts` (a preload link for the Latin file of each web font, against re-wrapping after first paint), `modules/feature-messages.ts`, `modules/page-paths/` (each Vue page's address per language from `ginko.config.ts`), `site-url.ts` | `ui`; bricks `site`, `legal` (route `localized('/legal/[slug]')`), `notices` from `@lupinum/ginko/basics` and a `home` page; `app/app.config.ts` with `site` (`SiteAppConfig`); `app/routes.ts` (`locales`, `localized`); modules `@lupinum/ginko/nuxt`, `@nuxt/fonts`, `@nuxtjs/color-mode` (`classSuffix: ''`), `nuxt-og-image` + `@takumi-rs/core`; `checkSiteUrl` in a `build:before` hook |
| `pages` | the `pages` brick (`app/bricks/pages.ts`) and the catch-all page `app/pages/[...slug].vue` | `site`; `pages: pages({ route: localized('/[slug]'), source: 'files' })`; content in `content/pages/` |
| `gallery` | `BlockGallery` (up to three photos one row of equal 3:2 tiles, more in justified rows) and `SiteLightbox`, texts in `i18n/gallery/` | `ui`, `site`; the `gallery` brick from basics |
| `faq` | `BlockFaq` (questions as h3 under a section's h2; `level` 2 on a page that lists them right under its h1) and the shadcn-vue accordion it is built on (`app/components/ui/accordion/`) | `ui`, `site`; the `faq` brick from basics; `faqJsonLd(items)` in the page's `usePageSeo({ jsonLd })` |
| `hours` | `HoursToday` (open now, today's times or the next opening), `HoursTable` (the week, coming hour plans, the public holiday rule, closures; prop `level` for its inner heading), `useHours`, `app/utils/hours.ts` (`spansLine`, `hoursNow` with spans past midnight, `plusDays`, `clockIn`), `site/FooterStatus.vue` (open now in the footer of every page), texts in `i18n/hours/` | `ui`, `site`; bricks `hours` and `hourPlans` (the gastro preset's `hours()` and `hourPlans()`, or basics'); `country` and `timeZone` in `ginko.config.ts` (public holidays, "today") |
| `menu` | the menu page (`/menu`, with category links, allergen key and VAT line), its print page (`/menu/print`, layout `print`), the lunch page (`/lunch`), `MenuDish`, `MenuDiet`, `MenuAllergens`, `MenuAllergenKey`, `MenuLunchDays`, `useMenu`, `useLunch`, texts in `i18n/menu/` | `ui`, `site`, **`hours`** (`useLunch` reads the opening hours, so a closed day shows no dish); bricks `menu` and `lunch` from `@lupinum/ginko-preset-gastro` (dishes are grouped by its `menuCategories`; allergens other than the EU letters show as written); pages `menu: localized('/menu')` and `lunch: localized('/lunch')`, so `path('menu')` and `path('lunch')` resolve; `currency` in `ginko.config.ts`; a translated page address needs its word in `segments` of `app/routes.ts` (`print` too: `/menu/print` is `/de/speisekarte/drucken`) |
| `events` | the events list (`/events`) and the event page (`/events/<slug>`) with Event JSON-LD in the site's time zone, `EventUpcoming` (the next events as a section of another page), `useEvents` (`useEventLd` builds Event JSON-LD, also with sessions as `subEvent`), `useEventBooking` (the booking link until `bookingUntil`, not when fully booked), texts in `i18n/events/`; the event page shows `app/components/event/Programme.vue` after the description and puts the sessions of `useSessionsLd` (app/composables/useSessions.ts) into its JSON-LD when a feature brings them (the sessions feature); a multi-day event's times read "Thu 09:00 – Fri 16:00" | `ui`, `site`; the `events` brick (basics `events()` or the gastro preset's) with `route: localized('/events/[slug]')`; the page `events: localized('/events')`, so `path('events')` resolves; `currency` and `timeZone` in `ginko.config.ts` |
| `blog` | news list (`news/index.vue`, page key `news`; `?tag=` filters), post page (`news/[slug].vue`: date, authors with initials, cover 3:2, tags, BlogPosting JSON-LD), `BlogPostList`, `BlogByline`, `useBlogPosts`, the RSS feed per language at `<news page>/rss.xml` (`server/middleware/news-feed.ts`), texts in `i18n/blog/` | `site`; `posts({ authors: 'people', route })` from basics and a `people` brick; `pages.news`; drafts are `draft: true` in a file (never built) |
| `people` | team page (`team.vue`, page key `team`) with `PeopleList` (photo 4:5 or `InitialsAvatar`, role, bio, contact) and Person JSON-LD, texts in `i18n/people/`; a template's own `app/components/people/TeamContact.vue` shows between the page header and the people (the company: service line and office) | `site`; `people()` from basics; `pages.team` |
| `downloads` | documents page (`downloads.vue`, page key `downloads`) with `DownloadsList` (direct links, date, type and size, the document's language when it differs from the page's), `DownloadsFileButton` (one document by id as a button, for another feature's page), `useDownloadText`, texts in `i18n/downloads/` | `ui`, `site`; `downloads()` from basics as the brick `downloads`; `pages.downloads`; the files in `public/` |
| `projects` | the `projects` brick (`app/bricks/projects.ts`: title, slug, summary, image, `ends` for campaigns with `visible` until it, optional `gallery` ref, body; Today: campaigns ending within 7 days), list (`projects/index.vue`, page key `projects`) and project page, `useProjectCards`, texts in `i18n/projects/` | `site`; `projects({ route })`; `pages.projects` |
| `sessions` | the programme page (`programme.vue`, page key `programme`: sessions by day, sorted by date and start time with basics' `sessionsInOrder`, time, summary, room, speakers linked, "Sold out" / "Cancelled" as words, "Now" on the running sessions of an event day, the ticket link while sales are open), the speakers list (`speakers/index.vue`, page key `speakers`) and speaker pages with their sessions, `SessionNowNext` (now and next on an event day, from the server's clock carried to the browser; cancelled sessions left out), `SessionRow`, `SessionProgramme`, `SessionSpeakers`, `event/Programme.vue` (the event's programme on its page), `useSessions` (the one reader of the `sessions` brick; only sessions of events on the site), `useNowAndNext`, `useSessionsLd` (the event page's Event JSON-LD gets each session as `subEvent`), `app/utils/sessions.ts` (`nowAndNext`, `byDay`, `dayAndClock`), texts in `i18n/sessions/` | `ui`, `site`, **`events`** (`useEventBooking`, the event page); `sessions({ people: 'people' })` and `people({ route })` from basics (speaker pages need the route: `localized('/speakers/[slug]')`); pages `programme` and `speakers`; `timeZone` in `ginko.config.ts`; a room name is written once, in the main-language file, so every language shows the same room |
| `services` | the `services` brick (`app/bricks/services.ts`: title, slug, summary, `pricing` as an explicit choice of `price` or `onRequest`, `price` (money, in `currency`; required for a fixed price, so the build and the Studio refuse one without it), `duration` in minutes, `specs` (label and value rows), `contact` (the person of `people` who answers enquiries), image, body; with `downloads` a `sheet` ref to that brick), list (`services/index.vue`, page key `services`; cards with price and duration in tabular numbers) and service page (price, duration, key facts, an email with the title in the subject to the contact person or the business: "Ask for a date" for a fixed price, the enquiry for one on request, and their phone number, the product sheet through `DownloadsFileButton` when the template has the downloads feature, Service JSON-LD with an Offer only for a fixed price; a template's own `app/components/services/Actions.vue` replaces that row of actions and gets `subject`, `email`, `phone` and the contact's name as props: the local business books by phone first), `useServiceText`, `useServiceCards`, `useServiceJsonLd`, texts in `i18n/services/` | `ui`, `site`; `services({ route, downloads? })` and a `people` brick; `pages.services`; `currency` in `ginko.config.ts`; `vat` in `app.config.ts` (`site`) for "plus VAT" or "incl. VAT" on prices and in the JSON-LD |
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

Hooks: a feature's page or component shows a template's own file in one place when it exists (found with `import.meta.glob`, so a
template without it builds unchanged): `site/FooterStatus.vue` (below), `pages/Top.vue`, `people/TeamContact.vue`,
`services/Actions.vue`.

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
`modules/page-paths/` (site) applies it to the page. A nested page (`menu/print.vue`) takes its parent's address
(`pages.menu`) plus the words of its own file-path parts from `segments`, so it needs no `pages` key (a key would also put
the page into the sitemap and the prerender list). This is the only mechanism: a template has no table of its own.
A feature page lists its page key in the table above.

## Contact details: one source

Email, phone and address are written once, in `content/site.md` (the `site` brick). The checks below cover email and
phone; the street and city are not checked, because an event's `location` is its own data and may name the same place. The footer, the imprint rows of
`/legal/<slug>`, the reservations and event buttons and `SiteContact` (`app/components/site/Contact.vue`: email, phone
and address as links) read them from there; opening hours come from the hours bricks. A text never repeats a value:
it says "write to us" and the page that shows the details (the pages feature's `components/pages/Top.vue` hook puts
`<SiteContact />` under the title of one page, as the starter does for `pages/contact` and the nonprofit for
`pages/get-involved`). Two checks keep it so: `sync --check` fails when the email or phone of `content/site.md` appears
in another file of `content/`, `app/` or `i18n/`, and gate 3 looks for both in every page's footer and in the imprint (opened from its `legalType: imprint` file).
`SiteContact` is a shared file of the site feature: a template that shows its details its own way (the restaurant) carries
it unused; it is lazy, so it costs no script. A person's own address (the `people` brick) is that person's data and may be linked in a text.

## Script budget (gate 6)

Gate 6 limits the gzip size of all script bodies a page loads (Chromium, 390 px wide, no cache) to 150 kB, counted as
1024 bytes. A template that needs more sets `"ginko": { "scriptBudget": <kB> }` in its `package.json`: the measured
maximum over its pages, rounded up to the next 5 kB, at most 170. Measured with the merging `cn` (tailwind-merge adds
about 8 kB), 15 Oct 2026, largest page of each template:

| Template | Largest page | Budget |
|---|---|---|
| starter | 138.6 kB (`/`, `/about`, `/contact`) | 150 (default) |
| nonprofit | 146.1 kB (the news list) | 150 (default) |
| restaurant | 156.3 kB (the events list and pages) | 160 (`scriptBudget`) |
| local-business | 159.1 kB (the treatments list and pages), 16 Oct 2026 | 160 (`scriptBudget`) |

A template over 170 kB does not get a larger budget: find the biggest chunks and cut.
