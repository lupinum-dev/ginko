# Nonprofit

A complete website for an association, a club or a small NGO: a mission statement on the home page, news with an RSS
feed, projects and campaigns that end on a date, the team, reports to download, partner logos and quotes, a donate
page that links to your donation service, and legal texts. In English, German, French and Arabic (right to left), with
light and dark mode. Built with [Nuxt](https://nuxt.com) and [Ginko](https://github.com/lupinum-dev/ginko). All
content is Markdown in `content/`; the site needs no account and no database. The sample is "River Commons", a river
clean-up association in a German town.

| Light | Dark |
|---|---|
| ![The nonprofit template's home page in light mode](.github/screenshots/home-light.png) | ![The nonprofit template's home page in dark mode](.github/screenshots/home-dark.png) |

## Quick start

```bash
npm create ginko@latest my-site -- --template nonprofit
```

This copies the template into `my-site`, keeps the languages you choose (`--locales en,de` for English and German,
`--locales de,en` for German first, `--locales en` for English only), moves the sample dates to this week, sets the
site id and writes a `.env` with a new `NUXT_APP_SECRET`. Then:

```bash
cd my-site
npm install
npm run dev
```

Or copy the folder as it is, with all four languages, through Nuxt's own command:

```bash
npm create nuxt@latest my-site -- -t github:lupinum-dev/ginko/templates/nonprofit#release
```

Copy `.env.example` to `.env` and fill in `NUXT_APP_SECRET` (see below). The `#release` branch follows the latest
Ginko release, so both commands give you the same files.

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Flupinum-dev%2Fginko%2Ftree%2Frelease%2Ftemplates%2Fnonprofit&env=NUXT_APP_SECRET&envDescription=Signs%20the%20share%20card%20URLs.%20Any%2032%20or%20more%20random%20characters.)

Any host that runs Node works: `npm run build` writes a server to `.output/`, started with
`node .output/server/index.mjs`. Set these variables where the site runs:

| Variable | What |
|---|---|
| `NUXT_APP_SECRET` | Signs the URLs of the share cards. 32 or more random characters (`openssl rand -hex 32`). |
| `NUXT_PUBLIC_SITE_URL` | The address of the live site, for example `https://www.river-commons.org`. On Vercel the production address is used when this is not set. |

A build on Vercel stops with a message while the address is still `example.com`, so search engines never see wrong
links. Other builds (CI, your computer) only print a warning.

The site runs as a server, not as static files: a campaign leaves the site the day after it ends and a notice the day
after its last day, with no new build. Static files (`npm run generate`) would keep them until the next build.

## Develop, build, preview

| Command | What |
|---|---|
| `npm run dev` | the site with live reload on http://localhost:3000; drafts show here |
| `npm run check` | Checks the content files in a few seconds: missing or wrong fields, dates, prices, links between pages and files in `public/`. Each problem names the file and the field. |
| `npm run build` | the production build in `.output/`; drafts are left out |
| `npm run preview` | runs that build locally |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript and Vue types |

`.github/workflows/ci.yml` runs lint, typecheck and build on every push. It needs no settings.

## Edit content

Every text is a Markdown file. The main language has no suffix (`about.md`); a translation adds the language code
(`about.de.md`) and repeats only what it translates. Dates, files and image files come from the main file; for an
image, a translation repeats only its `alt` (`image: { alt: … }`), and without it the page uses the main language’s
alt. The number at the start of a file name sets the order. After each change, run `npm run check`.

Files point to other entries by id: the folder and the file name without number and language, so
`content/people/1.jana-becker.md` is `people/jana-becker`. The `slug` is only the address on the site: renaming a file
breaks the references to it, changing the `slug` does not.

Write dates as `2026-10-24`, times as `'09:30'` (two-digit hours), prices as a plain number in euros (`95` or `12.50`).

| On the site | File |
|---|---|
| Home page: mission, lead, photo | `content/home.md` (and `home.de.md`, `home.fr.md`, `home.ar.md`) |
| News | `content/posts/<name>.md`: `title`, `description` (the summary), `date`, `authors` (people by id, `[people/jana-becker]`), `tags`, `image` (the cover, 3:2: `src` and `alt`), `slug` (optional, made from the title); `draft: true` keeps a post off the site |
| Projects and campaigns | `content/projects/<n>.<name>.md`: `title`, `summary`, `image` (`src` and `alt`), the text; `ends` for a campaign (the last day it shows); `actionLabel` and `actionUrl` for a button below the title ("Donate now") |
| Team and board | `content/people/<n>.<name>.md`: `name`, `role`, `bio`, `email`, `phone`; no photo needed, the site shows initials |
| Reports to download | `content/downloads/<name>.md`: `title`, `summary`, `date`, `file` (a PDF in `public/reports/`), `language` (the language of the file, for example `en`; leave it out when the file is in your main language; the sample sets `en` because the sample PDF is English) |
| Partner logos | `content/logos/<n>.<name>.md`: `name`, `image` (an SVG or PNG in `public/logos/`), `url` |
| Quotes on the home page | `content/quotes/<n>.<name>.md`: `text`, `name`, `role`; the home page shows the first |
| About, Get involved, Donate and other pages | `content/pages/<n>.<name>.md`; each translation sets its own address with `slug:`. `actionLabel` and `actionUrl` add one button below the title (the Donate page's "Donate online") |
| Notices above the header | `content/notices/<n>.<name>.md`: `text` (at most 140 characters; in quotes when it contains a colon) and `until` (the last day it shows, like `2026-12-31`; without it the notice stays until you delete the file); a translation has only `text` |
| Events | `content/events/<n>.<name>.md`: `title`, `slug` (optional, made from the title), `when` (`from` and `to` dates, the same date twice for one day), `start` and `end` (`'10:00'`, two-digit hours), `location`, `online`, `booking`, `bookingUntil`, `soldOut: true`, `image` (`src` and `alt`), `price` (euros as a number, `12.50`; leave it out for a free event), and the text below the frontmatter (required); the list at `/events`, one page per event (see "Events" below) |
| Name, address, register entry, email, phone | `content/site.md` (footer, imprint, search engines) |
| Privacy policy, terms, imprint | `content/legal/` (placeholders for Germany: replace them before you go live) |
| Site name, description for search engines | `ginko.config.ts` (`name`, `seo.description`) |
| Menu, footer links, the line under the name in the footer | `app/app.config.ts` |
| The home page's title in search results and tabs, section titles and texts of the home page and the lists | `i18n/<language>.json` (`home.title` is "River clean-ups in Musterstadt"); the features' own texts are in `i18n/<feature>/<language>.json`, and a key set in `i18n/<language>.json` wins |

Each language has a news feed at `<news page>/rss.xml` (`/news/rss.xml`, `/de/aktuelles/rss.xml`, …) with the title,
summary, date and authors of every post that is online.

Notices show newest first: give a new notice a smaller number than the others (`0.` works and numbers may have gaps,
so older notices keep theirs). At most two show at once.

**Events.** Every coming event of `content/events/` is on the events page (`/events`, linked in the footer) and has
its own page with date, time, place and the text. The next one also shows in the closing band of the home page and at
the top of the Get involved page, with the dates after it below; with no coming event these parts hide. Past events
leave the site by themselves. Without a `booking` link, an event page offers your phone and email from
`content/site.md` for questions.

## Make it yours

- **Name.** `name` in `ginko.config.ts` (header, footer, share cards, search engines). The sample name also appears as
  text in `seo.description` in `ginko.config.ts`, in `content/home*.md` (`lead`), in `content/pages/1.about*.md` and in
  `content/pages/3.donate*.md` (the account holder and the note on donation receipts). `legalName` in `content/site.md`
  is the registered name (with “e.V.”) for the footer and imprint. Search `content/` and `i18n/` for “River Commons”
  and replace what is left. To show a shorter name on phones, set `shortName` in `app/app.config.ts`.
- **Menu.** `nav` in `app/app.config.ts` holds at most six items: a page of `ginko.config.ts` (`{ page: 'news', label:
  { … } }`, label per language, the same words as the page's title) or a page of `content/pages/` by id (`{ entry:
  'pages/about' }` is `content/pages/1.about.md`).
- **Logo.** Put the file in `public/` and set `logo: { src: '/logo.svg', width: 120, height: 32 }` in
  `app/app.config.ts`. Without it, the header shows the name.
- **Colour.** `--brand` and `--brand-foreground` in `app/assets/css/main.css`, once for light and once for dark
  (`.dark`); in `.dark` also `--brand-surface` and `--brand-surface-foreground` (the closing band). The light `--brand`
  is also `seo.color` in `ginko.config.ts` (the background of the share cards). This template uses green (`#15803d`,
  dark `#86efac`). Text on the colour needs a contrast of at least 4.5:1 in both modes; check each pair with a
  contrast checker (for example webaim.org/resources/contrastchecker). `DESIGN.md` has the rules.
- **Fonts.** `--font-body` in `main.css`; Arabic pages use Noto Sans Arabic (`:lang(ar)` in `main.css`, the family in
  `nuxt.config.ts`). `@nuxt/fonts` downloads the fonts at build time and serves them from your site.
- **Organisation type.** `organization: 'NGO'` in `app/app.config.ts` tells search engines what you are; address and
  contact come from `content/site.md`, the country from `country` in `ginko.config.ts`.
- **Addresses.** The words of the addresses per language (`news` → `aktuelles`, `actualites`, `akhbar`) are in
  `app/routes.ts`. Change a word there; the pages, the menu and the links follow.

`DESIGN.md` explains the tokens and components. The parts in `app/components/ui/` are
[shadcn-vue](https://www.shadcn-vue.com) components.

## Add a page

**A text page:** add `content/pages/4.volunteering.md` with a `title`, an optional `summary` and the text below the
frontmatter. It appears at `/volunteering`; each translation sets its own address with `slug:` (`slug: ehrenamt` in
`4.volunteering.de.md` gives `/de/ehrenamt`). Add `{ entry: 'pages/volunteering' }` to `nav` or `footer` in
`app/app.config.ts` to link it.

**A page with its own layout:** add a Vue file in `app/pages/`, for example `app/pages/partners.vue`. Start it with
`<BlockPageHeader>` and call `usePageSeo()`, like `app/pages/team.vue`. Register it in `ginko.config.ts` under `pages`
(`partners: localized('/partners')`) and add the words of its address per language to `segments` in `app/routes.ts`
(`partners: { en: 'partners', de: 'partner', fr: 'partenaires', ar: 'shuraka' }`). It then answers at `/partners`,
`/de/partner`, … and `useGinkoPath()('partners')` links to it.

## Add or remove a language

The languages are the `locales` list in `app/routes.ts`; the first is the main language, whose addresses have no
prefix. Arabic is written right to left: the layout turns around by itself (the page sets `dir="rtl"`).

- **Remove one:** start fresh with `npm create ginko@latest my-site -- --template nonprofit --locales en,de`, or
  delete it from `locales` and from the maps in `app/routes.ts` and `languages` in `ginko.config.ts`, then delete its
  files (`*.fr.md`, `i18n/fr.json`, `i18n/*/fr.json`).
- **Add one** (for example Spanish): add `'es'` to `locales` and a word per address in `app/routes.ts`, its tag to
  `languages` in `ginko.config.ts` (`es: 'es-ES'`), and the Spanish labels of `nav`, `footer` and `tagline` in
  `app/app.config.ts` (without them they show in the main language). Add `i18n/es.json` and the texts of every
  `i18n/<feature>/en.json` translated as `i18n/<feature>/es.json`.
- **Translate the content** as `content/**/*.es.md`. A page, legal text, post or project shows in the new language
  only once it has its translation file: without one it is not on the Spanish site, the menu leaves it out, and links
  to it lead to its page in the main language. Translate at least the legal texts (`content/legal/`) before the
  language goes live.

## Add a donation form or a contact form

The site sends no data to other companies, so it has no forms. The Donate page's button leads to your donation
service (`actionUrl` in `content/pages/3.donate.md`, the label per language in `actionLabel`); a contact form works
the same way: link to a form service of your choice. Name the service in your privacy policy.

## Remove a feature

Links in the content name pages by their key (`[annual report]($page.downloads)`). After you remove a page, search
`content/` for `$page.<key>` and remove or change those links: the build stops on a link that leads nowhere.

| Feature | Delete |
|---|---|
| Projects | `content/projects/`, the `projects` brick and `pages.projects` in `ginko.config.ts`, its `nav` item, the "Current projects" section in `app/pages/index.vue`, `app/pages/projects/`, `app/bricks/projects.ts`, `app/composables/useProjects.ts`, `i18n/projects/`, and `"projects"` in `package.json` → `ginko.features` |
| News | `content/posts/`, the `posts` brick and `pages.news`, its `nav` item, the "Latest news" section on the home page, `app/pages/news/`, `app/components/blog/`, `app/composables/useBlog.ts`, `server/middleware/news-feed.ts`, `i18n/blog/`, `"blog"` in `ginko.features`; the links to `$page.news` in `content/pages/2.get-involved*.md` |
| Team | `content/people/`, `pages.team`, its `footer` item, `app/pages/team.vue`, `app/components/people/`, `i18n/people/`, `"people"` in `ginko.features`; the links to `$page.team` in `content/pages/1.about*.md`; keep the `people` brick while posts name authors |
| Reports | `content/downloads/`, `public/reports/`, the `downloads` brick and `pages.downloads`, its `footer` item, `app/pages/downloads.vue`, `app/components/downloads/`, `i18n/downloads/`, `"downloads"` in `ginko.features`; the links to `$page.downloads` in `content/pages/1.about*.md` and `3.donate*.md`, and the notice about the annual report in `content/notices/` |
| Logos and quotes | `content/logos/`, `content/quotes/`, `public/logos/`, the `logos` and `quotes` bricks, their sections on the home page, `app/bricks/logos-quotes.ts`, `app/components/block/Logos.vue`, `Quote.vue`, `"logos-quotes"` in `ginko.features` |
| Notices | `content/notices/`, the `notices` brick, `<SiteNotice />` in `app/layouts/default.vue`, `app/components/site/Notice.vue` |
| A language | see "Add or remove a language" |
| Dark mode | `<SiteThemeToggle />` in `app/components/site/Header.vue`, `app/components/site/ThemeToggle.vue`, and `@nuxtjs/color-mode` with its `colorMode` options in `nuxt.config.ts` and `package.json` |
| Share cards | `nuxt-og-image` and `@takumi-rs/core` in `nuxt.config.ts` and `package.json`; then `NUXT_APP_SECRET` is not needed |

## Before you deploy

- [ ] `NUXT_PUBLIC_SITE_URL` (or `url` in `ginko.config.ts`) is your real address.
- [ ] `NUXT_APP_SECRET` is set where the site runs.
- [ ] `content/site.md` shows your real name, address, register entry and contact details.
- [ ] The Donate page has your donation link and bank details, and the note on donation receipts fits you.
- [ ] The placeholders in `content/legal/` are replaced by your own texts, and the ones you do not need are deleted.
- [ ] The sample quotes, partner logos, report PDF and photos are replaced or deleted; quotes only with the person's
      permission.
- [ ] Every photo you added has alt text in each language (`npm run check` only requires the main language) and a
      source in `MEDIA.md`.

## Move to the Studio

Ginko Studio is Lupinum's hosted editor: volunteers write news on their phone and a board member checks it before it
goes online, campaigns end by themselves, and the Today page shows how old the newest post is and the next event. It
is open by invitation, and Lupinum moves your content with you. The site stays the same code: each brick in
`ginko.config.ts` loses its `source: 'files'`, and its content then comes from the Studio. Until then, everything here
works without it. Ask at [lupinum.com](https://lupinum.com).

## Updating

Move all Ginko packages to the same version in one step:

```bash
npm install @lupinum/ginko@latest @lupinum/ginko-content@latest @lupinum/ginko-i18n@latest
```

The release notes list "Template files changed": compare those files with yours if you want the changes.

## License

Code: MIT (see `LICENSE`). Media: see `MEDIA.md`.
