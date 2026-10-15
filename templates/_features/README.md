# Template features

Shared sources of the templates in `templates/<name>/` (spec: ginko-internal `specs/TEMPLATES.md` §2, §3). A template
lists its features in `package.json` → `"ginko": { "features": [...] }`; `pnpm templates sync` copies the files each
feature's `files.json` lists into it (code files get a first line naming the source) and `pnpm templates sync --check`
fails on drift. Edit the files here, never the copies. Files not in `files.json` (this README, `e2e/`) stay here;
`e2e/*.spec.ts` run in gate 3 of every template that uses the feature.

| Feature | Brings | Needs in the template |
|---|---|---|
| `ui` | `DESIGN.md`, `components.json`, `app/assets/css/tokens.css`, `app/lib/utils.ts`, `app/components/ui/` (shadcn-vue: button, sheet) | packages `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`, `shadcn-nuxt`, `reka-ui`, `@vueuse/core`, `class-variance-authority`, `clsx`, `@lucide/vue`; `app/assets/css/main.css` that imports tailwindcss, tw-animate-css and `./tokens.css` and sets `--brand`, `--brand-foreground` (light and `.dark`) and `--font-body`; `seo.color` in `ginko.config.ts` equal to the light `--brand` (`sync --check` compares them); `shadcn: { prefix: '', componentDir: './app/components/ui' }` and the Tailwind Vite plugin in `nuxt.config.ts` |
| `site` | layout, header, phone nav sheet, footer, skip link, logo, theme toggle, language switch, notice bar, `/legal/<slug>` page, `error.vue`, `usePageSeo` (title, share card, JSON-LD), the blocks (Hero, PageHeader, Section, Cards, Features, Cta, Empty), `ProseBody`, `InitialsAvatar`, legal placeholder texts (en, de), its texts in `i18n/site/`, `modules/feature-messages.ts`, `site-url.ts` | `ui`; bricks `site`, `legal` (route `localized('/legal/[slug]')`), `notices` from `@lupinum/ginko/basics` and a `home` page; `app/app.config.ts` with `site` (`SiteAppConfig`); `app/routes.ts` (`locales`, `localized`); modules `@lupinum/ginko/nuxt`, `@nuxt/fonts`, `@nuxtjs/color-mode` (`classSuffix: ''`), `nuxt-og-image` + `@takumi-rs/core`; `checkSiteUrl` in a `build:before` hook |
| `pages` | the `pages` brick (`app/bricks/pages.ts`) and the catch-all page `app/pages/[...slug].vue` | `site`; `pages: pages({ route: localized('/[slug]'), source: 'files' })`; content in `content/pages/` |
| `gallery` | `BlockGallery` (justified rows) and `SiteLightbox`, texts in `i18n/gallery/` | `ui`, `site`; the `gallery` brick from basics |
| `faq` | `BlockFaq` and the shadcn-vue accordion it is built on (`app/components/ui/accordion/`) | `ui`, `site`; the `faq` brick from basics; `faqJsonLd(items)` in the page's `usePageSeo({ jsonLd })` |
| `hours` | `HoursToday` (open now, today's times or the next opening), `HoursTable` (the week, coming hour plans, the public holiday rule, closures; prop `level` for its inner heading), `useHours` (`spansLine`, `hoursNow` with spans past midnight, `plusDays`), `site/FooterStatus.vue` (open now in the footer of every page), texts in `i18n/hours/` | `ui`, `site`; bricks `hours` and `hourPlans` (the gastro preset's `hours()` and `hourPlans()`, or basics'); `country` and `timeZone` in `ginko.config.ts` (public holidays, "today") |
| `menu` | the menu page (`/menu`, with category links, allergen key and VAT line), its print page (`/menu/print`, layout `print`), the lunch page (`/lunch`), `MenuDish`, `MenuDiet`, `MenuAllergens`, `MenuAllergenKey`, `MenuLunchDays`, `useMenu`, `useLunch`, texts in `i18n/menu/` | `ui`, `site`, **`hours`** (`useLunch` reads the opening hours, so a closed day shows no dish); bricks `menu` and `lunch` from `@lupinum/ginko-preset-gastro` (dishes are grouped by its `menuCategories`; allergens other than the EU letters show as written); pages `menu: translated('/menu')` and `lunch: translated('/lunch')`, so `path('menu')` and `path('lunch')` resolve; `currency` in `ginko.config.ts`; a translated page address needs its line in `slugs` of `app/routes.ts` (`/menu/print` too) |
| `events` | the events list (`/events`) and the event page (`/events/<slug>`) with Event JSON-LD in the site's time zone, `EventUpcoming` (the next events as a section of another page), `useEvents`, texts in `i18n/events/` | `ui`, `site`; the `events` brick (basics `events()` or the gastro preset's) with `route: translated('/events/[slug]')`; the page `events: translated('/events')`, so `path('events')` resolves; `currency` and `timeZone` in `ginko.config.ts` |

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
(`useI18n('site')`); a template overrides one under the same key in its own `i18n/<code>.json`. Content samples that
differ per template (`content/site.md`, notices, pages) belong to the template, not to a feature. Feature content in a
language (`content/legal/1.privacy.de.md`: a two-letter suffix, optionally with a region) and a feature's texts in a
language (`i18n/site/de.json`) are copied only into templates that have that locale; the main-language content file
(no suffix) always is.
