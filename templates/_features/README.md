# Template features

Shared sources of the templates in `templates/<name>/` (spec: ginko-internal `specs/TEMPLATES.md` §2, §3). A template
lists its features in `package.json` → `"ginko": { "features": [...] }`; `pnpm templates sync` copies the files each
feature's `files.json` lists into it (code files get a first line naming the source) and `pnpm templates sync --check`
fails on drift. Edit the files here, never the copies. Files not in `files.json` (this README, `e2e/`) stay here;
`e2e/*.spec.ts` run in gate 3 of every template that uses the feature, and `e2e/studio/*.spec.ts` are its owner jobs
in the Studio (gate 7, `pnpm templates test <name> --platform`: site notice, pages edit, hours closed today, menu
lunch week and price, events add, blog news post, sessions change, jobs post); each template names its content for
them in `templates/_studio/<template>/jobs.json`.

| Feature | Brings | Needs in the template |
|---|---|---|
| `ui` | `DESIGN.md`, `components.json`, `app/assets/css/tokens.css`, `app/lib/utils.ts`, `app/components/ui/` (shadcn-vue: button, sheet) | packages `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`, `shadcn-nuxt`, `reka-ui`, `@vueuse/core`, `class-variance-authority`, `clsx`, `@lucide/vue`; `app/assets/css/main.css` that imports tailwindcss, tw-animate-css and `./tokens.css` and sets `--brand`, `--brand-foreground` (light and `.dark`) and `--font-body`; `seo.color` in `ginko.config.ts` equal to the light `--brand` (`sync --check` compares them); `shadcn: { prefix: '', componentDir: './app/components/ui' }` and the Tailwind Vite plugin in `nuxt.config.ts` |
| `site` | layout, header, phone nav sheet, footer, `SiteContact` (email, phone and address as links), skip link, logo, theme toggle, language switch, notice bar, `/legal/<slug>` page, `error.vue`, `usePageSeo` (title, share card, JSON-LD), the blocks (Hero, PageHeader, Section, Cards, Features, Cta, Empty), `ProseBody`, `InitialsAvatar`, its texts in `i18n/site/`, `app/utils/telHref.ts` (the one `tel:` link helper), `server/plugins/font-preload.ts` (a preload link for the Latin file of each web font, against re-wrapping after first paint), `modules/feature-messages.ts`, `modules/page-paths/` (each Vue page's address per language from `ginko.config.ts`), `modules/feeds/` (a static build lists the feed of each `server/middleware/<page key>-feed.ts` per language), `site-url.ts` | `ui`; bricks `site`, `legal` (route `localized('/legal/[slug]')`), `notices` from `@lupinum/ginko/basics` and a `home` page; `app/app.config.ts` with `site` (`SiteAppConfig`); `app/routes.ts` (`locales`, `localized`); modules `@lupinum/ginko/nuxt`, `@nuxt/fonts`, `@nuxtjs/color-mode` (`classSuffix: ''`), `nuxt-og-image` + `@takumi-rs/core`; `checkSiteUrl` in a `build:before` hook |
| `pages` | the `pages` brick (`app/bricks/pages.ts`) and the catch-all page `app/pages/[...slug].vue` | `site`; `pages: pages({ route: localized('/[slug]'), source: 'files' })`; content in `content/pages/` |
| `gallery` | `BlockGallery` (up to three photos one row of equal 3:2 tiles, more in justified rows; `stack`: one below the other at full width in their own ratio, the first loaded at once) and `SiteLightbox`, texts in `i18n/gallery/` | `ui`, `site`; the `gallery` brick from basics when the site has a gallery page (`BlockGallery` alone takes any `ImageValue[]`, such as a project's photos) |
| `faq` | the FAQ page (`faq.vue`, page key `faq`: the questions as h2 in an accordion, FAQPage JSON-LD, and one line to a person below them: the contact page `pages/contact`, else `SiteContact`), `BlockFaq` (questions as h3 inside a `BlockSection`; `heading-level="h2"` on a page of their own; closed answers stay in the page, hidden until found, and print open) and the shadcn-vue accordion it is built on (`app/components/ui/accordion/`), texts in `i18n/faq/` (a template sets its title and lead with `faq.title`, `faq.lead`) | `ui`, `site`; the `faq` brick from basics; `pages.faq`; `faqJsonLd(items)` in the `usePageSeo({ jsonLd })` of another page that shows questions |
| `hours` | `HoursToday` (open now, today's times or the next opening), `HoursTable` (the week, coming hour plans, the public holiday rule, closures; prop `level` for its inner heading), `useHours`, `app/utils/hours.ts` (`spansLine`, `hoursNow` with spans past midnight, `plusDays`, `clockIn`), `site/FooterStatus.vue` (open now in the footer of every page), texts in `i18n/hours/` | `ui`, `site`; bricks `hours` and `hourPlans` (the gastro preset's `hours()` and `hourPlans()`, or basics'); `country` and `timeZone` in `ginko.config.ts` (public holidays, "today") |
| `menu` | the menu page (`/menu`, with category links, allergen key and VAT line), its print page (`/menu/print`, layout `print`), the lunch page (`/lunch`), `MenuDish`, `MenuDiet`, `MenuAllergens`, `MenuAllergenKey`, `MenuLunchDays`, `useMenu`, `useLunch`, texts in `i18n/menu/` | `ui`, `site`, **`hours`** (`useLunch` reads the opening hours, so a closed day shows no dish); bricks `menu` and `lunch` from `@lupinum/ginko-preset-gastro` (dishes are grouped by its `menuCategories`; allergens other than the EU letters show as written); pages `menu: localized('/menu')` and `lunch: localized('/lunch')`, so `path('menu')` and `path('lunch')` resolve; `currency` in `ginko.config.ts`; a translated page address needs its word in `segments` of `app/routes.ts` (`print` too: `/menu/print` is `/de/speisekarte/drucken`) |
| `events` | the events list (`/events`) and the event page (`/events/<slug>`) with Event JSON-LD in the site's time zone, `EventUpcoming` (the next events as a section of another page), `useEvents` (`useEventLd` builds Event JSON-LD, also with sessions as `subEvent`), `useEventBooking` (the booking link until `bookingUntil`, not when fully booked), texts in `i18n/events/`; the event page shows `app/components/event/Programme.vue` after the description and puts the sessions of `useSessionsLd` (app/composables/useSessions.ts) into its JSON-LD when a feature brings them (the sessions feature); a multi-day event's times read "Thu 09:00 – Fri 16:00" | `ui`, `site`; the `events` brick (basics `events()` or the gastro preset's) with `route: localized('/events/[slug]')`; the page `events: localized('/events')`, so `path('events')` resolves; `currency` and `timeZone` in `ginko.config.ts` |
| `blog` | news list (`news/index.vue`, page key `news`: the tags as links, posts grouped by year once they span more than one, Blog JSON-LD), post page (`news/[slug].vue`: date and reading time, authors with initials (linked to their page when `people` has a route), cover 3:2, tags, the older and the newer post, BlogPosting JSON-LD), a page per tag (`news/tags/[tag].vue`: `<news page>/tags/<tag>`, the word `tags` translated by `segments`; tags are free text per language, so the language switch there leads to the news page), `BlogPostList`, `BlogByline`, `useBlogPosts`, `useBlogTags`, `useTagPath`, the RSS feed per language at `<news page>/rss.xml` (`server/middleware/news-feed.ts`), texts in `i18n/blog/` | `site`; `posts({ authors: 'people', route })` from basics with `drafts: true` and a `people` brick; `pages.news`; drafts are `draft: true` in a file and a post dated after the build day is scheduled: neither is built (`nuxt dev` shows both) |
| `people` | team page (`team.vue`, page key `team`) with `PeopleList` (photo 4:5 or `InitialsAvatar`, name (a link to the person's page when `people` has a route), role, bio, contact) and Person JSON-LD, texts in `i18n/people/`; a template's own `app/components/people/TeamContact.vue` shows between the page header and the people (the company: service line and office; the portfolio: the way to start a project) | `site`; `people()` from basics; `pages.team` |
| `downloads` | documents page (`downloads.vue`, page key `downloads`) with `DownloadsList` (direct links, date, type and size, the document's language when it differs from the page's), `DownloadsFileButton` (one document by id as a button, for another feature's page), `useDownloadText`, texts in `i18n/downloads/` | `ui`, `site`; `downloads()` from basics as the brick `downloads`; `pages.downloads`; the files in `public/` |
| `projects` | the `projects` brick (`app/bricks/projects.ts`: title, slug, summary, image, `ends` for campaigns with `visible` until it, body; Today: campaigns ending within 7 days; `details: true` is for work that stays online: no `ends` and no button, but `client`, `year`, `place`, `scope` and `photos`, each photo with a required description, drafts (`draft: true`, listed on Today) and the task "Add photos"), list (`projects/index.vue`, page key `projects`) and project page, `useProjectCards`, `projectCampaign` (a campaign's `ends` and button, read only where the brick has them), texts in `i18n/projects/`; three hooks of the template: `app/components/projects/List.vue` (prop `items`) replaces the cards of the list, `app/components/projects/Body.vue` (prop `project`) replaces the photo and text of a project's page, `app/composables/useProjectJsonLd.ts` (`useProjectJsonLd()` returns a function of the project) adds JSON-LD to the page's `usePageSeo` (the portfolio brings all three: large photos; photos with the lightbox, facts, the next project; CreativeWork) | `site`; `projects({ route })`; `pages.projects` |
| `sessions` | the programme page (`programme.vue`, page key `programme`: sessions by day, sorted by date and start time with basics' `sessionsInOrder`, time, summary, room, speakers linked, "Sold out" / "Cancelled" as words, "Now" on the running sessions of an event day, the ticket link while sales are open), the speakers list (`speakers/index.vue`, page key `speakers`) and speaker pages with their sessions, `SessionNowNext` (now and next on an event day, from the server's clock carried to the browser; cancelled sessions left out), `SessionRow`, `SessionProgramme`, `SessionSpeakers`, `event/Programme.vue` (the event's programme on its page), `useSessions` (the one reader of the `sessions` brick; only sessions of events on the site), `useNowAndNext`, `useSessionsLd` (the event page's Event JSON-LD gets each session as `subEvent`), `app/utils/sessions.ts` (`nowAndNext`, `byDay`, `dayAndClock`), texts in `i18n/sessions/` | `ui`, `site`, **`events`** (`useEventBooking`, the event page); `sessions({ people: 'people' })` and `people({ route })` from basics (speaker pages need the route: `localized('/speakers/[slug]')`); pages `programme` and `speakers`; `timeZone` in `ginko.config.ts`; a room name is written once, in the main-language file, so every language shows the same room |
| `services` | the `services` brick (`app/bricks/services.ts`: title, slug, summary, `pricing` as an explicit choice of `price` or `onRequest`, `price` (money, in `currency`; required for a fixed price, so the build and the Studio refuse one without it), `duration` in minutes, `specs` (label and value rows), `contact` (the person of `people` who answers enquiries), image, body; with `downloads` a `sheet` ref to that brick), list (`services/index.vue`, page key `services`; cards with price and duration in tabular numbers) and service page (price, duration, key facts, an email with the title in the subject to the contact person or the business: "Ask for a date" for a fixed price, the enquiry for one on request, and their phone number, the product sheet through `DownloadsFileButton` when the template has the downloads feature, Service JSON-LD with an Offer only for a fixed price; a template's own `app/components/services/Actions.vue` replaces that row of actions and gets `subject`, `email`, `phone` and the contact's name as props: the local business books by phone first), `useServiceText`, `useServiceCards`, `useServiceJsonLd`, texts in `i18n/services/` | `ui`, `site`; `services({ route, downloads? })` and a `people` brick; `pages.services`; `currency` in `ginko.config.ts`; `vat` in `app.config.ts` (`site`) for "plus VAT" or "incl. VAT" on prices and in the JSON-LD |
| `jobs` | open jobs list (`jobs/index.vue`, page key `jobs`; with no open job an invitation to an open application) and job page (place, employment, work place, last day, the text, apply by email with the job title in the subject or the job's `applyUrl`; JobPosting JSON-LD with `validThrough`), `JobsList`, `useOpenJobs`, `useApplyLink`, `useJobJsonLd`, texts in `i18n/jobs/` | `ui`, `site`; `jobs({ route })` from basics (`validUntil` required: an expired job leaves list, page, sitemap and JSON-LD); `pages.jobs`; an email in `content/site.md` for jobs without `applyEmail` and for open applications |
| `logos-quotes` | the `logos` (name, image, url) and `quotes` (text, name, role; no photo) bricks (`app/bricks/logos-quotes.ts`), `BlockLogos` (one height, own widths) and `BlockQuote` | `site`; `logos()` and `quotes()` in `bricks`; the logo files in `public/` |
| `pricing` | the `pricing` brick (`app/bricks/pricing.ts`: name, summary, `pricing` as an explicit choice of `price` or `onRequest`, `monthly` and `yearly` (money in `currency`, both required for `price`, so the build and the Studio refuse a plan without them), `included` rows, `recommended`, `actionLabel`, `actionUrl`; Studio tasks "Change a price", "Edit a plan", "Add a plan"), the pricing page (`pricing.vue`, page key `pricing`: `PricingPlans` side by side from `md` with rows aligned by subgrid, stacked on phones, the price per month and per year written out (no switch, no script), "Recommended" as a word on the first plan marked so, the VAT note from `vat` above the plans, a Product with one Offer per month and one per year for each priced plan, none for "on request"), `usePlans`, `usePricingVat`, `usePricingJsonLd`, texts in `i18n/pricing/`; a template's own `app/components/pricing/More.vue` shows below the plans (the saas template: questions about billing) | `ui`, `site`; `pricing()` from `app/bricks/pricing.ts`; `pages.pricing`; `currency` in `ginko.config.ts`; `vat` in `app.config.ts` (`site`); for a plan without `actionUrl` the contact page `pages/contact` or, without one, `email` in `content/site.md` |
| `changelog` | the changelog page (`changelog.vue`, page key `changelog`: one section per release, newest first, with version, date, its anchor `#v4-6-0` (`releaseAnchor` of basics, the same as `@lupinum/ginko-docs`) and the Markdown text, which names its kinds of change under `### New`, `### Improved`, `### Fixed`), `ChangelogLatest` (the newest releases with their summaries, for another page), `useReleases`, `useLatestReleases`, the RSS feed per language at `<changelog page>/rss.xml` (`server/middleware/changelog-feed.ts`), `app/utils/changelog.ts` (`releaseSummary`: the text before `<!-- more -->`), texts in `i18n/changelog/` | `site`; `changelog()` from basics (the stored shape of `@lupinum/ginko-docs`); `pages.changelog`; file names without dots (`v4-6-0.md`) |
| `docs` | for a docs site on the layer `@lupinum/ginko-docs`: `DESIGN.md` (the layer's tokens and rules), `site-url.ts` (a symlink to the site feature's file, so both have one source); its e2e checks every internal link of every page in every language (`links.spec.ts`) and the visitor jobs: start page, search, changelog, a page without a translation (`docs.spec.ts`) | neither `ui` nor `site` (the layer brings header, footer, search and theme); `extends: ['@lupinum/ginko-docs']`; bricks `docs: docsCollection({ locales })`, optionally `home: docsHome()` and `changelog: changelogCollection()` with `pages.changelog: changelogPages({ locales })`; `checkSiteUrl` in a `build:before` hook |

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
A template may bring its closing band for the feature pages that convince a visitor: `app/components/site/PageCta.vue`
(one `BlockCta`, the template's main action). The changelog page, the blog post page and the FAQ page show it at their
end when the file exists (the saas template: the free trial, the same band as its home page). Never on legal, contact
or error pages, and at most one band per page (TEMPLATES-DESIGN).

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
| portfolio | 146.3 kB (the work list, `/work`) | 150 (default) |
| restaurant | 156.3 kB (the events list and pages) | 160 (`scriptBudget`) |
| local-business | 161.7 kB (the treatment pages), 16 Oct 2026, after the shared booking buttons | 165 (`scriptBudget`) |
| saas | 146.6 kB (the blog list; home and pricing 146.4, 16 Oct) | 150 (default) |
| blog | 145.5 kB (the posts list; 16 Oct) | 150 (default) |
| docs | 149.8 kB (the start page and every docs page; the layer loads the Markdown components everywhere) | 150 (default) |

A template over 170 kB does not get a larger budget: find the biggest chunks and cut.
