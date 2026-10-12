# @nuxtjs/sitemap: no upstream issue needed

Checked 2026-10-07 against @nuxtjs/sitemap 8.6.1. Evidence: `.evidence/upstream/sitemap.md`.
Repro: `upstream/repros/sitemap` (local, commits `370fc2d` failing, `f6b8193` passing).

The public Nitro hook `sitemap:input` runs after all sources resolve and before normalization and
deduplication. With `sitemap.autoI18n: false`, a ginko-i18n Nitro plugin can attach explicit
alternates to the URLs it knows. Page and prerender discovery stay on, and unknown URLs (content,
dynamic pages) pass through unchanged. SSR and `nuxt generate` XML pass all checks: one entry per
locale, no duplicates, hreflang for every translation plus x-default, and no `en` alternate for a
German-only page.

**Config key.** Sitemap reads `nuxt.options.i18n` only after it detects a module it knows by package
name, so ginko-i18n alone does not collide. (Co-installing @nuxtjs/i18n is already refused, D1.)

**Applied 2026-10-07** in ginko-i18n (D13): `runtime/server/plugins/sitemap.ts` replaces the URL
source endpoint. Edge suite 45/45.
