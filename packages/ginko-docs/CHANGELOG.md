# @lupinum/ginko-docs

## 0.12.0

### Minor Changes

- [#86](https://github.com/lupinum-dev/ginko/pull/86) [`8d0c4c0`](https://github.com/lupinum-dev/ginko/commit/8d0c4c01e7ba2eaf715e917b2c031c5ffef7d120) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change docs pages stored on the platform to show no "Edit this page" link to the Studio by default; set `docs.studioEditLink: true` in `app.config.ts` to keep it.

### Patch Changes

- Updated dependencies []:
  - @lupinum/ginko@0.12.0
  - @lupinum/ginko-components@0.12.0
  - @lupinum/ginko-content@0.12.0
  - @lupinum/ginko-i18n@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [[`474281a`](https://github.com/lupinum-dev/ginko/commit/474281aba38171c9d8df8f5f1a90e9ed4c667c29), [`cb0c1fc`](https://github.com/lupinum-dev/ginko/commit/cb0c1fcec6235e99ecd71254b46b265ff84286f6)]:
  - @lupinum/ginko@0.11.0
  - @lupinum/ginko-components@0.11.0
  - @lupinum/ginko-content@0.11.0
  - @lupinum/ginko-i18n@0.11.0

## 0.10.1

### Patch Changes

- Updated dependencies [[`6ffd497`](https://github.com/lupinum-dev/ginko/commit/6ffd497242142a17656c8b7d0831c8b15351cd45), [`c5aebca`](https://github.com/lupinum-dev/ginko/commit/c5aebcaa82694154ce3e6d141297bc45feaca130)]:
  - @lupinum/ginko@0.10.1
  - @lupinum/ginko-components@0.10.1
  - @lupinum/ginko-content@0.10.1
  - @lupinum/ginko-i18n@0.10.1

## 0.10.0

### Patch Changes

- Updated dependencies [[`6bd8ca6`](https://github.com/lupinum-dev/ginko/commit/6bd8ca6f2020017a09e66dd41d253ee52a9fd338), [`a824888`](https://github.com/lupinum-dev/ginko/commit/a824888e0bb0c186847d39215da54c7c73766799), [`c9f4d4d`](https://github.com/lupinum-dev/ginko/commit/c9f4d4d6642a0555d2ad8df4dc7a28b582390ffe), [`f71856e`](https://github.com/lupinum-dev/ginko/commit/f71856e00a12f9847982c1c2c12ed64a651d4171), [`7ec1afc`](https://github.com/lupinum-dev/ginko/commit/7ec1afc6685a7a16d86c7ad6c511729e4b07c2d9), [`1b23cbe`](https://github.com/lupinum-dev/ginko/commit/1b23cbe5ad6c20d595ac24d1f8fb3b6e826e0575)]:
  - @lupinum/ginko@0.10.0
  - @lupinum/ginko-components@0.10.0
  - @lupinum/ginko-content@0.10.0
  - @lupinum/ginko-i18n@0.10.0

## 0.9.0

### Minor Changes

- [#59](https://github.com/lupinum-dev/ginko/pull/59) [`f753aa7`](https://github.com/lupinum-dev/ginko/commit/f753aa7a12162b6ce2ff764a8667bc2b4bea3d80) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change the Markdown parser to comark 0.8: heading anchors stay the same, and a code block without a code component now has `data-language` instead of `language`.

- [#64](https://github.com/lupinum-dev/ginko/pull/64) [`409df79`](https://github.com/lupinum-dev/ginko/commit/409df791c869eefcdaa91c209cb2aa9b7e5411e9) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change docs pages (`docsCollection`) and the free pages of the starter templates to use drafts: on the platform, Speichern on a live page keeps the change unpublished until Veröffentlichen; pass `drafts: false` to `docsCollection` to keep one-step saving.

### Patch Changes

- [#63](https://github.com/lupinum-dev/ginko/pull/63) [`1fd5e90`](https://github.com/lupinum-dev/ginko/commit/1fd5e90582543baefb7729f61155156b9c6297d8) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change the docs side navigation to read its tabs and sections through Ginko's shared navigation rules, which the Studio's new navigation tree uses too; the navigation it shows stays the same.
- Updated dependencies [[`f753aa7`](https://github.com/lupinum-dev/ginko/commit/f753aa7a12162b6ce2ff764a8667bc2b4bea3d80), [`f753aa7`](https://github.com/lupinum-dev/ginko/commit/f753aa7a12162b6ce2ff764a8667bc2b4bea3d80), [`1fd5e90`](https://github.com/lupinum-dev/ginko/commit/1fd5e90582543baefb7729f61155156b9c6297d8), [`b78c0a8`](https://github.com/lupinum-dev/ginko/commit/b78c0a8370390043eb9b83147a6f5feb6eab028d), [`b78c0a8`](https://github.com/lupinum-dev/ginko/commit/b78c0a8370390043eb9b83147a6f5feb6eab028d)]:
  - @lupinum/ginko@0.9.0
  - @lupinum/ginko-content@0.9.0
  - @lupinum/ginko-components@0.9.0
  - @lupinum/ginko-i18n@0.9.0

## 0.8.0

### Patch Changes

- [#57](https://github.com/lupinum-dev/ginko/pull/57) [`99aef44`](https://github.com/lupinum-dev/ginko/commit/99aef444f2788c3e9de98fce5ff4c2f2c248c96c) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix lists in docs texts losing their bullets and numbers on sites with Tailwind's reset.
- Updated dependencies [[`5d6522a`](https://github.com/lupinum-dev/ginko/commit/5d6522ae3c6ab9059c8d0d4d8218aa60d2738fe5)]:
  - @lupinum/ginko@0.8.0
  - @lupinum/ginko-components@0.8.0
  - @lupinum/ginko-content@0.8.0
  - @lupinum/ginko-i18n@0.8.0

## 0.7.0

### Minor Changes

- [#48](https://github.com/lupinum-dev/ginko/pull/48) [`b018582`](https://github.com/lupinum-dev/ginko/commit/b018582cb88c4b49f7a770e2f26a857ed9df2703) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `navTitle` (a short title for the navigation, breadcrumbs and previous/next links) and `navExtras: false` (no Tab, Badge, Icon) to docs pages; docs fields get German, English, Spanish and French labels in a "Navigation" group.

### Patch Changes

- [#48](https://github.com/lupinum-dev/ginko/pull/48) [`b018582`](https://github.com/lupinum-dev/ginko/commit/b018582cb88c4b49f7a770e2f26a857ed9df2703) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix the docs theme defaults overriding a site's Tailwind 4 `@theme`: they now sit in `@layer theme`, so on a Tailwind site without its own fonts the docs use Tailwind's font stacks instead of Inter.
- Updated dependencies [[`0441339`](https://github.com/lupinum-dev/ginko/commit/0441339dcfe4ac4eb91f25507356f4b0bf0efbe3), [`2c71cb5`](https://github.com/lupinum-dev/ginko/commit/2c71cb50361dda16d540107bb42885e8e72dc400), [`2130302`](https://github.com/lupinum-dev/ginko/commit/2130302340e8a2eeef38d133dfa8c6190d96e65e), [`7f7247d`](https://github.com/lupinum-dev/ginko/commit/7f7247d40c0d5efe43c4aacaadf169a27f5516f4), [`7f7247d`](https://github.com/lupinum-dev/ginko/commit/7f7247d40c0d5efe43c4aacaadf169a27f5516f4), [`2c71cb5`](https://github.com/lupinum-dev/ginko/commit/2c71cb50361dda16d540107bb42885e8e72dc400), [`b018582`](https://github.com/lupinum-dev/ginko/commit/b018582cb88c4b49f7a770e2f26a857ed9df2703), [`2c71cb5`](https://github.com/lupinum-dev/ginko/commit/2c71cb50361dda16d540107bb42885e8e72dc400), [`b35884f`](https://github.com/lupinum-dev/ginko/commit/b35884fbf408f09aeb58b1c31ca5aa1e8b7b7175)]:
  - @lupinum/ginko@0.7.0
  - @lupinum/ginko-components@0.7.0
  - @lupinum/ginko-content@0.7.0
  - @lupinum/ginko-i18n@0.7.0

## 0.6.7

### Patch Changes

- [#43](https://github.com/lupinum-dev/ginko/pull/43) [`ad2fb20`](https://github.com/lupinum-dev/ginko/commit/ad2fb208dd4e27c82944c60f781f3ba2f16a159d) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add site search for platform content: on a site with platform bricks, `/__ginko/search/<locale>.json` (the docs search box and `search_docs`) is built from the published content and renewed like a page, so a page published in the Studio is found within a minute. Expired entries are left out.
- Updated dependencies [[`ad2fb20`](https://github.com/lupinum-dev/ginko/commit/ad2fb208dd4e27c82944c60f781f3ba2f16a159d)]:
  - @lupinum/ginko@0.6.7
  - @lupinum/ginko-components@0.6.7
  - @lupinum/ginko-content@0.6.7
  - @lupinum/ginko-i18n@0.6.7

## 0.6.6

### Patch Changes

- [#41](https://github.com/lupinum-dev/ginko/pull/41) [`3b67f9f`](https://github.com/lupinum-dev/ginko/commit/3b67f9fc2477808c4fb74580b0bfd14bd77bc094) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix a slow check on request paths: a URL ending in thousands of slashes no longer keeps the site's server busy for seconds.
- Updated dependencies [[`3b67f9f`](https://github.com/lupinum-dev/ginko/commit/3b67f9fc2477808c4fb74580b0bfd14bd77bc094)]:
  - @lupinum/ginko@0.6.6
  - @lupinum/ginko-components@0.6.6
  - @lupinum/ginko-content@0.6.6
  - @lupinum/ginko-i18n@0.6.6

## 0.6.5

### Patch Changes

- Updated dependencies [[`db38050`](https://github.com/lupinum-dev/ginko/commit/db380506aa6375d0408a4881fee4e382b54ee9c4)]:
  - @lupinum/ginko@0.6.5
  - @lupinum/ginko-components@0.6.5
  - @lupinum/ginko-content@0.6.5
  - @lupinum/ginko-i18n@0.6.5

## 0.6.4

### Patch Changes

- Updated dependencies [[`02628b2`](https://github.com/lupinum-dev/ginko/commit/02628b2b2329bc769d9dfd0c358837afdb4d2af6)]:
  - @lupinum/ginko@0.6.4
  - @lupinum/ginko-components@0.6.4
  - @lupinum/ginko-content@0.6.4
  - @lupinum/ginko-i18n@0.6.4

## 0.6.3

### Patch Changes

- [#34](https://github.com/lupinum-dev/ginko/pull/34) [`d451a07`](https://github.com/lupinum-dev/ginko/commit/d451a0764427989ad4abfb346c390a28d2955dd6) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `idPrefix` to `GinkoMarkdown`: it puts a prefix before every id and `#` link of one body, so a page that shows several bodies has no duplicate ids. The docs changelog uses it with each release's anchor.
- Updated dependencies [[`d451a07`](https://github.com/lupinum-dev/ginko/commit/d451a0764427989ad4abfb346c390a28d2955dd6), [`d451a07`](https://github.com/lupinum-dev/ginko/commit/d451a0764427989ad4abfb346c390a28d2955dd6), [`d451a07`](https://github.com/lupinum-dev/ginko/commit/d451a0764427989ad4abfb346c390a28d2955dd6)]:
  - @lupinum/ginko@0.6.3
  - @lupinum/ginko-components@0.6.3
  - @lupinum/ginko-content@0.6.3
  - @lupinum/ginko-i18n@0.6.3

## 0.6.2

### Patch Changes

- Updated dependencies [[`d082b85`](https://github.com/lupinum-dev/ginko/commit/d082b856851dabbf1d02d06d2d5796c50a3f825d)]:
  - @lupinum/ginko@0.6.2
  - @lupinum/ginko-components@0.6.2
  - @lupinum/ginko-content@0.6.2
  - @lupinum/ginko-i18n@0.6.2

## 0.6.1

### Patch Changes

- Updated dependencies [[`f13ccdb`](https://github.com/lupinum-dev/ginko/commit/f13ccdbeeb6bc9eb84162ba25ceeacfe0fb3267e)]:
  - @lupinum/ginko@0.6.1
  - @lupinum/ginko-components@0.6.1
  - @lupinum/ginko-content@0.6.1
  - @lupinum/ginko-i18n@0.6.1

## 0.6.0

### Patch Changes

- [#28](https://github.com/lupinum-dev/ginko/pull/28) [`3246028`](https://github.com/lupinum-dev/ginko/commit/3246028d0b767801950f6f54f49e7edddd204143) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix the first release of a template or a docs home on the platform: every required field of a single now has a default (or is optional), so the platform can create its entry.
- Updated dependencies [[`ee8c8a9`](https://github.com/lupinum-dev/ginko/commit/ee8c8a982a64ee15a1cab906b7a3b58fe8c686e6)]:
  - @lupinum/ginko@0.6.0
  - @lupinum/ginko-components@0.6.0
  - @lupinum/ginko-content@0.6.0
  - @lupinum/ginko-i18n@0.6.0

## 0.5.0

### Minor Changes

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add public ways to customize the docs: `<DocsShell>` for a site's own pages in the docs frame, the override points `DocsPageEnd` and `DocsSidebarEnd`, and `docs: { search: false }`.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add a docs frame for sites that embed the docs in their own layout: no framed panel, the search above the navigation, a phone bar with the navigation as a sheet, and `--docs-gutter` to line the docs up with the site's container.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `homePages({ locales })` to `@lupinum/ginko-docs/config`: the start page by locale, with the main locale at `/`.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change the docs layer to draw icons itself instead of with @nuxt/icon: pages outside the docs no longer download an icon library (about 16 KB gzip less on every page of a site that embeds the docs), and docs pages load only the icons they use. Icon names work as before (any installed Iconify set). The build finds them in your Markdown front matter and component attributes (not in prose or code blocks), in YAML and JSON content, in `app.config.ts` and in your own `app/` components (`<Icon name="lucide:x" />`); it reads all locales and ignores commented-out code. A name built at runtime (a variable) is not found, so write it once as a literal; a name that is not installed logs one build warning with its file. A site's own `@nuxt/icon` still wins over the layer's `Icon`. Remove the `icon` options from your nuxt.config if you set any. The icon hints in the editor now say "needs a global Icon component".

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add route links outside Markdown: the start page's buttons and cards, `nav`, `footer.links` and `banner.href` take `$docs.<page>` and `$page.<key>`, which lead to the page in the reader's language.

- [#24](https://github.com/lupinum-dev/ginko/pull/24) [`c28d1e3`](https://github.com/lupinum-dev/ginko/commit/c28d1e3e4ba1e558f8c71d7b69961f7474a221d1) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `source: 'platform'` to docsCollection, docsHome, blogCollections and changelogCollection, so docs content can be edited in Ginko Studio; the default stays `'files'`.

### Patch Changes

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `breadcrumbJsonLd(steps, siteUrl)` to `@lupinum/ginko`: a JSON-LD BreadcrumbList from steps with `title` and `path`, such as the nodes of `useGinkoBreadcrumbs` (templates/_features/site/app/composables/usePageSeo.ts uses it).

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix the 404 page's main-language link ignoring the site's i18n strategy, and name the language in the reader's language

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix the focus ring of the default theme in light mode: emerald-700 instead of emerald-500, 5.5:1 against the page instead of 2.5:1.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix layout shift on first load of a docs page: the standalone layout preloads Inter, so text no longer re-wraps when the font arrives.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add French texts to the docs layer.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix the "not translated" note in the language menu: screen readers read it in the page's language. An empty changelog now says where to add releases.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix English fallback text on translated docs pages being read in the page language, and add a link to the main-language page on a docs 404 under another language

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add CollectionPage JSON-LD and a description to the changelog page, and CollectionPage JSON-LD to the blog list.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix tables with three columns on phones narrower than 360 px: the last column keeps its width and the table scrolls, instead of showing a few letters per line.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix docs tables, the home feature list and the install box on phones.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change the phone header and menu of the docs layer: the light/dark button stays in the header, and the menu lists the languages as links at its top, one tap each.

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change the JSON-LD of a blog post from Article to BlogPosting, built by `postJsonLd` of `@lupinum/ginko/basics`, with the post's tags as keywords.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix route links outside Markdown (nav, footer, banner, start page): they lead to the main-language page when the current language has no such doc, instead of a raw `$docs…` address.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix the docs layer adding a second blog, blog feed or changelog at /blog and /changelog to a site that has its own: it now adds them only at the address of your posts and changelog and only when you have no page there.
  
  A changelog page needs `changelog: changelogPages({ locales })` in `pages` (or a `route` on the changelog brick); without an address the build warns once and the layer adds no changelog. The layer now decides after all of your pages are known, so a page that the page-paths module moves to `/blog` also counts as yours, and its links to the blog and changelog follow the addresses you configured.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix short tables in the docs ending before the edge of their frame: the rows and the header now fill it.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add a note to the language menu for a language that has no version of the page: "Not translated: opens the start page".

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Fix wide tables, long titles and the previous and next links making docs pages scroll or squeeze text on phones

- [#21](https://github.com/lupinum-dev/ginko/pull/21) [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Change Markdown refs in page state to carry no table of contents: read `toc` from the loaded text, `(await useGinkoMarkdown(() => entry.value.data.body)).value?.toc`.

- [#23](https://github.com/lupinum-dev/ginko/pull/23) [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7) Thanks [@Mat4m0](https://github.com/Mat4m0)! - Add `releaseAnchor(version)` to `@lupinum/ginko/basics`: the anchor of a release on a changelog page (`4.6.0` → `v4-6-0`). The changelog page of `@lupinum/ginko-docs` and the changelog feature of the templates (templates/_features/changelog/app/composables/useChangelog.ts, server/middleware/changelog-feed.ts) use it, so both keep the same public addresses.
- Updated dependencies [[`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`c28d1e3`](https://github.com/lupinum-dev/ginko/commit/c28d1e3e4ba1e558f8c71d7b69961f7474a221d1), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`7b165c2`](https://github.com/lupinum-dev/ginko/commit/7b165c25e17ed2f4fb50e8054febf618a6af10d7), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991), [`80f93a4`](https://github.com/lupinum-dev/ginko/commit/80f93a4f6bd171e1146b929913254039becdd991)]:
  - @lupinum/ginko@0.5.0
  - @lupinum/ginko-components@0.5.0
  - @lupinum/ginko-content@0.5.0
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
  - @lupinum/ginko@0.4.0
  - @lupinum/ginko-i18n@0.4.0
  - @lupinum/ginko-content@0.4.0
  - @lupinum/ginko-components@0.4.0
