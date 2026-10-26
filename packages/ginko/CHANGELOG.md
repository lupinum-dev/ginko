# @lupinum/ginko

## 0.9.0

### Minor Changes

- [#59](https://github.com/lupinum-dev/ginko/pull/59) [`f753aa7`](https://github.com/lupinum-dev/ginko/commit/f753aa7a12162b6ce2ff764a8667bc2b4bea3d80) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change the Markdown parser to comark 0.8: heading anchors stay the same, and a code block without a code component now has `data-language` instead of `language`.

- [#59](https://github.com/lupinum-dev/ginko/pull/59) [`f753aa7`](https://github.com/lupinum-dev/ginko/commit/f753aa7a12162b6ce2ff764a8667bc2b4bea3d80) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change component definitions to refuse prop names that end in `Html`, which a component would write as markup.

- [#63](https://github.com/lupinum-dev/ginko/pull/63) [`1fd5e90`](https://github.com/lupinum-dev/ginko/commit/1fd5e90582543baefb7729f61155156b9c6297d8) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change the docs side navigation to read its tabs and sections through Ginko's shared navigation rules, which the Studio's new navigation tree uses too; the navigation it shows stays the same.

- [#61](https://github.com/lupinum-dev/ginko/pull/61) [`b78c0a8`](https://github.com/lupinum-dev/ginko/commit/b78c0a8370390043eb9b83147a6f5feb6eab028d) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add the smaller copies and the focus point of a library picture to `::figure`, and a 4:3 `landscape` aspect ratio

### Patch Changes

- Updated dependencies []:
  - @lupinum/ginko-i18n@0.9.0

## 0.8.0

### Minor Changes

- [#56](https://github.com/lupinum-dev/ginko/pull/56) [`5d6522a`](https://github.com/lupinum-dev/ginko/commit/5d6522ae3c6ab9059c8d0d4d8218aa60d2738fe5) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `titleTemplate: false` to `useGinkoSeo` for a title that already names the site, such as a home page titled "<name> in Vienna".

### Patch Changes

- Updated dependencies []:
  - @lupinum/ginko-i18n@0.8.0

## 0.7.0

### Minor Changes

- [#46](https://github.com/lupinum-dev/ginko/pull/46) [`7f7247d`](https://github.com/lupinum-dev/ginko/commit/7f7247d40c0d5efe43c4aacaadf169a27f5516f4) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `facts` in ginko.config: texts quote fields of single bricks with `:fact{name="practice.price"}`, and pages, site search, Markdown twins and llms-full.txt show the value in effect today (a planned change from its date). The Studio shows such a component as a chip with the value the page shows, and any inline component without text of its own as a chip instead of an empty box. Also `useGinkoFact()` and `valueOn()`.

- [#46](https://github.com/lupinum-dev/ginko/pull/46) [`7f7247d`](https://github.com/lupinum-dev/ginko/commit/7f7247d40c0d5efe43c4aacaadf169a27f5516f4) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add a release check for facts: a release that removes a fact that texts still quote is refused and names those texts (`pnpm local:dev` shows a warning instead), and the pushed schema now includes `languages`, so the platform formats fact values the same way the site does.

### Patch Changes

- [#47](https://github.com/lupinum-dev/ginko/pull/47) [`0441339`](https://github.com/lupinum-dev/ginko/commit/0441339dcfe4ac4eb91f25507356f4b0bf0efbe3) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `.mcp.json` from `pnpm local:dev`: an agent in the site folder works in the local CMS once you have signed in.

- [#49](https://github.com/lupinum-dev/ginko/pull/49) [`2c71cb5`](https://github.com/lupinum-dev/ginko/commit/2c71cb50361dda16d540107bb42885e8e72dc400) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add LocalBusiness subtypes (HealthAndBeautyBusiness, ProfessionalService, Store, Restaurant, TravelAgency and more) and Corporation, EducationalOrganization to `siteJsonLd` and `organizationLd`.

- [#51](https://github.com/lupinum-dev/ginko/pull/51) [`2130302`](https://github.com/lupinum-dev/ginko/commit/2130302340e8a2eeef38d133dfa8c6190d96e65e) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix a release that changes components: it now checks every stored text that can use them, so a removed prop or option cannot break a page, and the plan lists the change.

- [#49](https://github.com/lupinum-dev/ginko/pull/49) [`2c71cb5`](https://github.com/lupinum-dev/ginko/commit/2c71cb50361dda16d540107bb42885e8e72dc400) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change the text of `legal()` to the `page` Markdown profile, so an imprint can quote the address and contact as facts.

- [#48](https://github.com/lupinum-dev/ginko/pull/48) [`b018582`](https://github.com/lupinum-dev/ginko/commit/b018582cb88c4b49f7a770e2f26a857ed9df2703) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix the Markdown twin printing icon names (`lucide:book-open`) from untranslated text fields as text.

- [#49](https://github.com/lupinum-dev/ginko/pull/49) [`2c71cb5`](https://github.com/lupinum-dev/ginko/commit/2c71cb50361dda16d540107bb42885e8e72dc400) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix `checkSite` accepting a reference from a platform brick to a file brick; it now names the field and how to fix it.

- [#53](https://github.com/lupinum-dev/ginko/pull/53) [`b35884f`](https://github.com/lupinum-dev/ginko/commit/b35884fbf408f09aeb58b1c31ca5aa1e8b7b7175) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add the config lines of the allowed way to each rejected schema change in `ginko check` and `ginko release`, with the site's brick and field names filled in.
- Updated dependencies []:
  - @lupinum/ginko-i18n@0.7.0

## 0.6.7

### Patch Changes

- [#43](https://github.com/lupinum-dev/ginko/pull/43) [`ad2fb20`](https://github.com/lupinum-dev/ginko/commit/ad2fb208dd4e27c82944c60f781f3ba2f16a159d) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add site search for platform content: on a site with platform bricks, `/__ginko/search/<locale>.json` (the docs search box and `search_docs`) is built from the published content and renewed like a page, so a page published in the Studio is found within a minute. Expired entries are left out.
- Updated dependencies []:
  - @lupinum/ginko-i18n@0.6.7

## 0.6.6

### Patch Changes

- [#41](https://github.com/lupinum-dev/ginko/pull/41) [`3b67f9f`](https://github.com/lupinum-dev/ginko/commit/3b67f9fc2477808c4fb74580b0bfd14bd77bc094) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix a slow check on request paths: a URL ending in thousands of slashes no longer keeps the site's server busy for seconds.
- Updated dependencies []:
  - @lupinum/ginko-i18n@0.6.6

## 0.6.5

### Patch Changes

- [#39](https://github.com/lupinum-dev/ginko/pull/39) [`db38050`](https://github.com/lupinum-dev/ginko/commit/db380506aa6375d0408a4881fee4e382b54ee9c4) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add an outline in the Studio preview: the page marks the text of the field you are editing and scrolls to it.
- Updated dependencies []:
  - @lupinum/ginko-i18n@0.6.5

## 0.6.4

### Patch Changes

- [#36](https://github.com/lupinum-dev/ginko/pull/36) [`02628b2`](https://github.com/lupinum-dev/ginko/commit/02628b2b2329bc769d9dfd0c358837afdb4d2af6) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `seo.noindex` to the site config: the pages it names leave the sitemap and answer with `X-Robots-Tag: noindex`.
- Updated dependencies []:
  - @lupinum/ginko-i18n@0.6.4

## 0.6.3

### Patch Changes

- [#34](https://github.com/lupinum-dev/ginko/pull/34) [`d451a07`](https://github.com/lupinum-dev/ginko/commit/d451a0764427989ad4abfb346c390a28d2955dd6) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `idPrefix` to `GinkoMarkdown`: it puts a prefix before every id and `#` link of one body, so a page that shows several bodies has no duplicate ids. The docs changelog uses it with each release's anchor.

- [#34](https://github.com/lupinum-dev/ginko/pull/34) [`d451a07`](https://github.com/lupinum-dev/ginko/commit/d451a0764427989ad4abfb346c390a28d2955dd6) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `NUXT_PUBLIC_GINKO_NOINDEX=true`, which keeps a whole deployment out of search, its own address included. Use it for demos and for a site that runs on a preview address before its domain switch: robots.txt then disallows everything and every response sends `X-Robots-Tag: noindex`. Site responses now also send `Permissions-Policy: camera=(), geolocation=(), microphone=()`.

- [#34](https://github.com/lupinum-dev/ginko/pull/34) [`d451a07`](https://github.com/lupinum-dev/ginko/commit/d451a0764427989ad4abfb346c390a28d2955dd6) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change the generated share card of a page with an image to JPEG. As PNG such a card weighed 400-700 KB, and WhatsApp drops preview images over about 300 KB. Cards without an image stay PNG.
- Updated dependencies []:
  - @lupinum/ginko-i18n@0.6.3

## 0.6.2

### Patch Changes

- [#32](https://github.com/lupinum-dev/ginko/pull/32) [`d082b85`](https://github.com/lupinum-dev/ginko/commit/d082b856851dabbf1d02d06d2d5796c50a3f825d) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix the first `ops:import` into a new site on the hosted platform once more: the history entry of its first release no longer counts as an edit.
- Updated dependencies []:
  - @lupinum/ginko-i18n@0.6.2

## 0.6.1

### Patch Changes

- [#30](https://github.com/lupinum-dev/ginko/pull/30) [`f13ccdb`](https://github.com/lupinum-dev/ginko/commit/f13ccdbeeb6bc9eb84162ba25ceeacfe0fb3267e) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix the first `ops:import` into a new site on the hosted platform: the singles that its first release created from their defaults no longer block the import, and a single the export lacks keeps its defaults.
- Updated dependencies []:
  - @lupinum/ginko-i18n@0.6.1

## 0.6.0

### Minor Changes

- [#26](https://github.com/lupinum-dev/ginko/pull/26) [`ee8c8a9`](https://github.com/lupinum-dev/ginko/commit/ee8c8a982a64ee15a1cab906b7a3b58fe8c686e6) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `GINKO_CONTENT=platform`: a site whose bricks read files takes its content from the platform instead, in the build and in `ginko release`, without a code change.

### Patch Changes

- Updated dependencies []:
  - @lupinum/ginko-i18n@0.6.0

## 0.5.0

### Minor Changes

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add @lupinum/ginko/basics: site, legal, people, posts, authors, changelog, jobs, faq and downloads bricks.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add country and sessions to @lupinum/ginko/basics; move hours, notices, events and gallery into basics (preset-gastro re-exports them unchanged).

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `breadcrumbJsonLd(steps, siteUrl)` to `@lupinum/ginko`: a JSON-LD BreadcrumbList from steps with `title` and `path`, such as the nodes of `useGinkoBreadcrumbs` (templates/_features/site/app/composables/usePageSeo.ts uses it).

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `status` to bricks: a declared status line for the Studio's Today page.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change the changelog basic to support drafts and scheduled entries: an entry dated after the build day stays out until the first build on or after its date, and `draft: true` holds an entry back.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `askAgainWhen` to `choices` fields: the Studio asks whether the choice is still right when the text it answers for changes.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `fields` to create tasks: the task asks and writes only those fields.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add an optional `language` field to the `downloads` brick of `@lupinum/ginko/basics`, so a list can say that a document is in another language (template files: `templates/_features/downloads/app/components/downloads/List.vue`).

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `bookingUntil` (the last day the booking link shows) to `events()` and an optional `summary` to `sessions()` from `@lupinum/ginko/basics` (template files: `templates/_features/events/app/composables/useEvents.ts`, `templates/_features/events/app/pages/events/[slug].vue`, `templates/_features/sessions/app/composables/useSessions.ts`, `templates/_features/sessions/app/components/session/Row.vue`, `templates/_features/sessions/app/pages/programme.vue`).

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `hours({ plans: 'hourPlans' })`: the hours name their hour plans in the stored schema (`status: { hours: { plans } }`), the release check refuses a key that is not a collection of hour plans, and the Studio's line for today reads only those plans.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add today's opening hours to the Studio's Today page: `hours()` declares `status: { hours: true }`.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add the site's `country` to page JSON-LD: `useGinkoSeo` fills `addressCountry` (and remote job applicants) where `siteJsonLd` or `jobJsonLd` got none.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change Markdown refs in page state to carry no table of contents: read `toc` from the loaded text, `(await useGinkoMarkdown(() => entry.value.data.body)).value?.toc`.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `formatMoney(money, language, { wholeWithoutMinor: true })` for "€390" instead of "€390.00", and `offerJsonLd` in `@lupinum/ginko/basics` for a schema.org Offer with an optional VAT note (templates/_features/services/app/composables/useServices.ts).

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `unitCode` to `offerJsonLd(money, currency, { unitCode })` for a recurring price: `MON` per month, `ANN` per year give the Offer a UnitPriceSpecification for one such unit, with `valueAddedTaxIncluded` when given. The pricing feature of the templates (templates/_features/pricing/app/composables/usePricing.ts) uses it for the plans' Offers.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change an outdated translation to stay on the site until someone updates or confirms it, instead of being replaced by the main-language text; `fallback` now lists only missing translations.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `planned` to `single()` and `collection()`: a field whose value changes on a date (`{ field: 'price', next: 'nextPrice', from: 'priceFrom' }`). The platform stores the planned value only with its date, opens a task on the new value from that date on, leaves the plan out of create tasks (Studio and agent tools), and `ginko check` reports a task that changes the field without showing its plan.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change platform Markdown fields to `{ ref }` in page state, as file bricks already are, so a page's payload carries only the texts it shows.
  
  Site code that reads a text's tree from an entry (`entry.data.body.nodes`) gets nothing now: load it with `useGinkoMarkdown(() => entry.value.data.body)` or, for several texts in one `useAsyncData`, `fetchGinkoMarkdown(value)`. `<GinkoMarkdown>` needs no change. A client navigation loads a text it has not shown yet from `/__ginko/platform/<locale>/<rev>/md/…`.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add the `authors` option to `posts()`: name the brick the post's authors come from, for example `people`.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `releaseAnchor(version)` to `@lupinum/ginko/basics`: the anchor of a release on a changelog page (`4.6.0` → `v4-6-0`). The changelog page of `@lupinum/ginko-docs` and the changelog feature of the templates (templates/_features/changelog/app/composables/useChangelog.ts, server/middleware/changelog-feed.ts) use it, so both keep the same public addresses.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `getGinkoItems(event, brick, locale)` for a site's own server routes (a feed, a calendar): the visible entries of a collection with their address, for file and platform bricks; `rssXml` in `@lupinum/ginko/basics` writes an RSS 2.0 feed (template files: `templates/_features/blog/server/middleware/news-feed.ts`).

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change a required field with `showWhen` to be required only while it shows: `price: f.money('Amount', { showWhen: { field: 'pricing', is: 'price' } })` now refuses a fixed price without an amount in the build, the Studio and agent tools, and accepts an entry on request without one (templates/_features/services/app/bricks/services.ts).

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `after` to time fields (an end time must be later than its start) and `timeZone` to the gastro `eventJsonLd`, which then writes the start with the site's offset.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change the default of `untranslated` for collections with a `route`: an entry is left out of a language until its required fields are translated there (no page, a 404 under its address, not in lists, the sitemap, hreflang or llms.txt); set `untranslated: 'fallback'` to list it there with a link to its main-language page.
  
  An outdated translation no longer hides anything, also with `'hide'`; only a missing one does. Collections without a `route` (authors, FAQ, dishes) keep `'fallback'` as their default. A missing slug or image description never counts as a missing translation. A link to an entry (`$blog.<name>`) in a translated text goes to its main-language page while the entry has no page in that language.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `wordsOf(value)`: the number of words of a Markdown value, also in lists where page state holds only `{ ref }`, for example for a reading time.

### Patch Changes

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix the Markdown twin and llms.txt slowing down on a title with a long run of spaces

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix the message for text in square brackets that is no link or image (`![Bild(datei)` or `[sic]`): it now names the missing "]" or address and how to write brackets as text, instead of reporting an unknown component "span".

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix a site refusing its own content as "bundle too large" when its texts are heavily formatted: the size limit now covers everything the platform allows (4 MiB of text plus 8 MiB of Markdown trees).

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix `nuxt dev` ignoring changes to `ginko.config.ts`: a saved change now restarts the dev server, and a save with an error is reported in the terminal while the site keeps running with the last good version.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix a missing entry from useGinkoEntry showing the last entry instead of the 404 when other code, such as useGinkoMarkdown, read it first; it now throws on every read and is a `Readonly<Ref>`.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add a `ginko check` warning when a brick's field maxima can add up past the entry limit, so a schema does not allow entries the platform refuses at Save.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix llms.txt, the Markdown twin of a page, its 404 suggestions and the site search naming an entry without a `title` field by its id (`people/lena-hofer`): they now use the field its slug is made from, such as a person's `name` with `people({ route })`.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change `events()` from `@lupinum/ginko/basics` so `route` is optional: without it the events have no pages, and a site can still list them.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `pathOf` and `defaultDir` to `@lupinum/ginko/internal`: the file layout of `ginko export`, which the Studio's backup download uses too.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix `$file.<id>` references inside fenced or inline code counting as picture uses: they are text now, for the file checks and for the `local:files-export` rewrite. An escaped backtick (`` \` ``) opens no code.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add a warning to `local:files-export` that counts the entries it leaves out (drafts, entries scheduled for later and entries that belong to a draft) and names the first three, so they can be added in the Studio.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix `local:files-export`: a content file marked `draft: true` stays out of the export, as it stays out of the build, instead of making the import refuse every entry.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add French, Italian and Arabic messages.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix llms.txt, link checks and Markdown block splitting slowing down on a long run of slashes, spaces or tabs, or on many unclosed `::snippet{`

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `grantGroups` to `@lupinum/ginko/internal`: a person's rights grouped by area, in the order of the site's schema.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change `upcomingClosures` and `upcomingHolidayClosures` to leave out a public holiday that falls on a day the week already closes.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix upcomingPlans to end a plan's shown range on the last day planOn still gives to that plan.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix image descriptions accepting invisible control characters and bidi overrides: an image field's description now refuses them with the same message as a text field.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix `local:import` for big and inconsistent exports: it refuses a collection over its maximum, an entry ID twice or two entries at one address before it clears anything, imports thousands of entries and references in smaller calls, prints no schema warning when there is none, and suggests running it again only when that can finish.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix links to entries in Markdown texts (`[Anna]($authors.<id>)`) after an import: they now point at the entry's new ID instead of showing as broken on the site.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix local imports on a busy machine: Convex's "Function execution timed out" is now read from `convex run` and the import tries again (up to three times, with growing waits).

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix the reason of a failed local command: it now shows the end of its error output, where the error is, instead of the first line.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `$file.<id>` references in platform Markdown texts: a picture, component image or link from the Files library is served with its current address, pixel size, smaller copies and library description, and a file that is gone is marked broken instead of loading nothing.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix HTML comments in Markdown (`<!-- TODO -->`) showing on the site as text: the parsed tree now leaves them out, also a comment around formatting or around whole paragraphs, and the stored text keeps them.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix Markdown reference links and images (`[Text][g]` with `[g]: https://…`): they now become normal links and images instead of an error about a component named "component".

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change the robots tag of `useGinkoSeo({ noindex: true })` to `noindex, follow`, so a page kept out of search results (the menu's print page in templates/_features/menu/app/pages/menu/print.vue, a draft) no longer tells search engines to ignore its links.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change the type of `unitCode` in `offerJsonLd` so editors suggest `MON` and `ANN`; other codes stay valid.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix the home page getting a second Organization JSON-LD node from `seo.organization` when the page writes its own (`siteJsonLd`).

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix a PDF of the Files library used as a picture (`![x]($file.<pdf id>)`): the text is now refused with a hint to link the PDF instead.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add a `route` option to `people()` from `@lupinum/ginko/basics`: with it, each person gets a web address (a slug made from the name) and a page, for example speakers. Without it the stored fields stay as they are. Template files that read a person's `url` and need the route: `templates/_features/sessions/app/pages/speakers/[slug].vue`, `templates/_features/sessions/app/pages/speakers/index.vue`, `templates/_features/sessions/app/components/session/Speakers.vue` and `templates/_features/sessions/app/composables/useSessions.ts`.

- [#24](https://github.com/lupinum-dev/ginko/pull/24) [`c28d1e3`](https://github.com/lupinum-dev/ginko/commit/c28d1e3e4ba1e558f8c71d7b69961f7474a221d1) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix a docs site whose bricks all live on the platform failing on every page: `#ginko/search` is now defined (empty) without file bricks.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix the Spanish label of `posts()`: "Artículos" instead of "Entradas", which the Studio uses for entries.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix `ginko check` and `ginko release` refusing a release because of an entry the release does not change or one in the trash: only live entries the release writes, and only when they grow, must fit the entry limit (480 KiB, counted without Markdown trees), and the message names the entry.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change the schema check to refuse a brick named `page` or `file`: `$page.…` and `$file.…` in Markdown texts always mean a page and a library file.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix every page downloading the Markdown component registry: only a page that shows Markdown loads it now.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix the build of a site with two headings in Arabic script on one page: the search index no longer stops with "duplicate ID".

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix the types of server auto-imports in a site that installs `@lupinum/ginko` from npm: `getGinkoItems` was `any` there.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `slugBases` to `@lupinum/ginko/internal`: the slug of a new entry per language before it is made unique, one rule for the platform and the Studio's preview of an entry not saved yet.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change the script every page loads to about 20 kB (gzip) less: the core's message catalogs, the editors' texts of the schema and the preview's listener no longer reach the browser.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix the order of a collection sorted by a translatable field (`jobs()` by title): each language's list now follows its own titles, not the German ones (templates/_features/jobs).

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix French, Italian, Spanish and Arabic message texts: Arabic counts use all plural forms and Arabic punctuation, French uses narrow no-break spaces and the typographic apostrophe, and a few wordings read more naturally.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix the silent loss of text after a block component without its closing `::` line: it is now refused with the line it starts on (Studio, agent tools, releases, `ginko check` and the build). Close every block component with a `::` line, also one at the very end of a text; for content files, `ginko check` and the build now fail and name the file and line.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Remove HEIC from the accepted upload types (`UPLOAD_TYPES`): the Files library cannot read HEIC photos. `local:files-export` now names a HEIC photo and says how to save it as JPEG.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix a week saved as a mid-week day (a lunch week from Thursday) being accepted although the site never shows it: the field that holds a week start (`plans.field`, or the date a task presets to `@workWeek` or `@nextWorkWeek`) now needs the first day of a week, also in content files.
- Updated dependencies [[`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991)]:
  - @lupinum/ginko-i18n@0.5.0

## 0.4.0

### Minor Changes

- [`ea2ea13`](https://github.com/lupinum-dev/ginko/commit/ea2ea133997f2011ad0d43f77a0f1dc75605923e) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add Ginko 0.4, the first release: one content system for Nuxt websites, from Markdown files in Git to a hosted platform.
  
  Owners, staff and AI agents edit the same content. All seven packages release together under one version. It starts at 0.4 because `@lupinum/ginko-content` and `@lupinum/ginko-docs` already published an older, unrelated line up to 0.3. Until 1.0, a minor version (0.4 → 0.5) may contain breaking changes; the changelog names each one and how to update.
  
  Requirements: Node 22.18+, 24 or 26, and Nuxt 4.6+ or Nuxt 5 (tested on its nightly until it is released). Start a site with `npm create ginko@latest my-site`; the documentation explains every step.
  
  **Public API**
  
  - `@lupinum/ginko`: `defineSite`, `single`, `collection`, `f`, `defineComponents`, `formatMoney`, `plainText`, `safeHref`, `startOfWeek` and the documented types. Imported, not auto-imported.
  - `@lupinum/ginko/nuxt`: the module, the `useGinko*` composables (everything that needs a Nuxt app starts with `useGinko`), `<GinkoMarkdown>` and `<GinkoImage>`. `@lupinum/ginko/vue`: `<GinkoMarkdown>` for any Vue app. `@lupinum/ginko/search`: `loadIndex` and `search`.
  - `@lupinum/ginko/internal` and `@lupinum/ginko/internal/search` are for Ginko's own packages and have no stability promise.
  - The `ginko` CLI: `check [--offline]`, `release` and `export [folder]`, plus `--version`. Every command run prints one JSON line, `{ "ok": true, … }` or `{ "ok": false, "error": { code, message } }` (`--help` and `--version` print plain text), and ends with exit code 0 (ok), 1 (fix the code), 2 (usage), 3 (platform unreachable, retry) or 4 (key not allowed). CI deploys the site only when `release` prints `"deploy": true` (a superseded run exits 0 with `"deploy": false`). The CLI reads `GINKO_PLATFORM` (or `NUXT_PUBLIC_GINKO_PLATFORM`), `GINKO_KEY`, `GINKO_COMMIT` (or `GITHUB_SHA`), `GINKO_BRANCH` and `GINKO_REMOTE`; it does not read `.env` files. `ginko-i18n --json` uses the same output shape, error codes (`USAGE`, `INVALID`) and exit codes.
  - Config names: `f.ref` (one entry) and `f.refs` (several); `visible: { mode: 'until', field, days?, deleteExpired? }`; prefill tokens `@today`, `@workWeek`, `@nextWorkWeek`; `firstDayOfWeek`, `linkCheck`, `untranslated`, `maxBytes`, `Migration.compute`, `retired` rule `{ drop: true }`. Options and defaults are typed per field, and an unknown top-level key fails the build.
  - Markdown components: `embed`, `frame` (`none`, `card`, `border`, …), `background` (`none`, `muted`, `tint`), `appearance` (`quiet`, `tint`), `quiz-question{mode}`, `code-tree{file}`.
  
  **Content (`@lupinum/ginko`, `@lupinum/ginko-content`)**
  
  - One text format: Markdown (comark 0.7) everywhere, with field profiles that limit what a field may contain. Footnotes, emoji, alerts, Shiki code, task lists, route links (`$blog.my-post`), reusable snippets and heading anchors.
  - Data files: YAML and JSON (one file, one entry) and CSV (one file, many entries), checked against the field schema; every error names the file and field, and the line for CSV rows and unreadable files. Entries with `draft: true` stay out of production builds.
  - Query engine in the site, over the loaded bundle: `where`, `order`, `limit`, pagination with totals, field selection, `include` for references, previous/next and facet counts.
  - References (`f.ref`, `f.refs`), navigation trees and breadcrumbs, and a URL for every entry in every language; two entries on one URL fail the build.
  - Link check before any HTML exists: route links, anchors, snippets and redirected paths, in the build, the dev terminal, `ginko check` and the agent tools. On the platform a save, a new entry or a scheduled publish that adds a broken link is stopped, and History says why. External links are checked on request (`linkCheck.external`), at build and in `ginko check` (never in dev), with a 7-day cache.
  - Images: WebP copies at 480, 960 and 1600 px, made at upload on the platform and at build for files. `<GinkoImage>` and Markdown images get `srcset` and `sizes`.
  - Redirects from `redirectFrom` (301) and site rules in `redirects` (301 by default, `status` 302/307/308 per rule).
  - SEO from the bundle, with no other module: title template, canonical, Open Graph with `og:url`, `<html lang>`, hreflang with `x-default`, sitemap with `lastmod`, images and alternates, robots.txt with `noindex` on preview hosts, JSON-LD. With `nuxt-og-image` (in every starter), every page gets a generated share card in the brand colour `seo.color`, with the site's logo and the page's image.
  - Works with the Nuxt SEO modules (`@nuxtjs/seo` or single ones, in any order): Ginko leaves them sitemap, robots.txt and JSON-LD defaults and hands them its pages with hreflang, the site's address, name and languages, and `noindex` on preview hosts. `nuxt-ai-ready` stays off while Ginko serves `/llms.txt`. Requires `nuxt-og-image` 7.
  - Search index built in plain JS at build time, one record per heading section, loaded lazily per language.
  - Agent output: `/llms.txt`, `/llms-full.txt`, a `.md` twin for every entry page (collections with a `route`), and a Markdown 404 that suggests pages. The normal address always answers with HTML.
  - Render modes: Git-only sites prerender everything; platform sites refresh changed pages after a publish; previews render with `noindex`.
  - In dev, `nuxt dev` restarts when `ginko.config.ts` changes, and a brick that cannot reach the platform names itself and the fix.
  - CLI `ginko`: `check` (schema, links and the share image, for every site; `--offline` without the platform) and `release` for CI, `export` for backups; `pnpm local:dev|import|pull` run only in the Ginko monorepo.
  
  **Languages (`@lupinum/ginko-i18n`)**
  
  - The only locale authority: routes, alternates, hreflang, messages with plurals, and formatters for dates, ranges, relative time, numbers, currency and lists, each in the site's time zone.
  - Works on its own in any Nuxt 4.6+ or Nuxt 5 app, without the rest of Ginko.
  
  **Components and docs (`@lupinum/ginko-components`, `@lupinum/ginko-docs`)**
  
  - Content components with props defined as Ginko fields: callouts, tabs, code groups, steps, cards, accordion, figures, embeds (click to load), timeline, quiz and more. Each one can also be copied into an app with the shadcn-vue CLI, from a registry the docs build generates.
  - Docs layer (`@lupinum/ginko-docs`; `npm create ginko@latest my-docs -- --preset docs` starts a site with it): navigation, section tabs, breadcrumbs, table of contents with scroll spy, previous/next, ⌘K search with heading results, blog with authors and RSS, changelog, copy page as Markdown, dark mode. A guide for switching from Nuxt Content and `@nuxtjs/i18n`. Math (KaTeX) and mermaid diagrams render and load only on pages that use them.
  
  **Platform and Studio (hosted by Lupinum)**
  
  The platform is a hosted service, not an npm package. A site connects to it with one setting; without it, the site reads its content from files.
  
  - Quick tasks for the jobs owners do most ("Heute geschlossen", "Preis ändern"), phone first, with the full form behind "Alles bearbeiten".
  - Files library: All, Recent, Unused, Missing alt text, Duplicates and folders; icon and list views; "used in" with links; replace a file and keep its references; a used file cannot be removed by mistake. Alt text set in the library is the default for every use, per language.
  - Approvals, off by default: a task or agent key can need a yes. Reviewers see the change, approve, approve for a time, or reject with a sentence; the author sees the reason. Releases publish several changes together.
  - History with "show changes", "back to this version" and undo; drafts and scheduled publishing; trash with restore; translation status per language; "why is this not on the website?".
  - Team and invitations with per-task rights, sign-in with an emailed code, AI agent keys with an MCP tool catalog derived from the operations, and weekly reminder mails.
  - Long forms group their fields under headings or in tabs (`group` on a field, `layout: 'tabs'` on a brick); phones always show headings.
  - A rich text editor (TipTap 3) that writes Markdown, where untouched text stays byte for byte. Headings, lists, task lists, quotes, code blocks, tables, images from the library, embeds, registry components with prop forms, slash and bubble menus, Markdown shortcuts and paste, source mode, find and replace (⌘F), a drag handle and Alt+↑/↓ to move blocks, character counter, a link card for pasted URLs, uploads with progress, and a formatting bar above the phone keyboard.
  - Delete a site, with seven days to cancel, and delete your own account. The last owner of a site must hand it over or delete it first.
  - Studio in German, English and Spanish (beta), light and dark.
  
  **Presets (`@lupinum/ginko-preset-gastro`, `create-ginko`)**
  
  - Gastro: opening hours with exceptions, seasons, holidays and new hours from a date; lunch week with planning ahead and an optional PDF; menu with prices from a date; notices that expire; events; JSON-LD for Restaurant, Menu, opening hours and Event; a printable lunch sheet.
  - `create-ginko` starts a new site, plain or with `--preset gastro|docs`. Starters install with npm, pnpm 11 and bun, carry a `typecheck` script, a page description and share cards (`nuxt-og-image` with Takumi, Nuxt 4.6.1 or later; set `NUXT_APP_SECRET` where the site runs, `.env` has one), and create-ginko warns on an unsupported Node.
  
  **Not in 0.4**
  
  Real-time co-editing comes next. Also not included: an agency preset, the editor UI as a shadcn-vue registry, OAuth for agent connectors, and a Google Business sync.

### Patch Changes

- Updated dependencies [[`ea2ea13`](https://github.com/lupinum-dev/ginko/commit/ea2ea133997f2011ad0d43f77a0f1dc75605923e)]:
  - @lupinum/ginko-i18n@0.4.0
