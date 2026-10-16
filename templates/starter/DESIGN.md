# Design system

The rules behind this site's look. Read them before you change colours, type or components, so the site stays
consistent and accessible (WCAG 2.2 AA, light and dark). The same system runs every Ginko template; only the accent
and the fonts differ.

## Principles

- A quiet, neutral base; your content and photos carry the character. One accent colour.
- Hierarchy from size and weight, not colour. One primary button per view. No gradients, glass, blur or decorative
  shadows. Separate with a 1px border or a background, never both.
- Phone first. Every page works at 320 px wide with no horizontal scroll; touch targets are at least 44 px.
- Only tokens. Tailwind's default palette, type scale, radii and shadows are switched off, so `bg-red-500` or
  `text-2xl` do nothing. A new value is a new token in the CSS and a row in this file, in the same change.

## Where things live

| What | File |
|---|---|
| Your accent and fonts | `app/assets/css/main.css` (`--brand`, `--brand-foreground`, `--font-body`, optional `--font-heading`); the light accent again as `seo.color` in `ginko.config.ts` (share cards) |
| Neutral colours, type scale, spacing, radii, shadow, focus, motion | `app/assets/css/tokens.css` (shared by all templates; do not edit) |
| Name, logo, navigation, footer links, profiles | `app/app.config.ts` |
| Components | `app/components/ui/` (shadcn-vue), `app/components/site/`, `app/components/block/` |

`tokens.css` and the components are copied from the Ginko repository (`templates/_features/`). You can change them in
your own site; in the Ginko repository, change the source there instead.

## Colours

shadcn names, so shadcn-vue components work unchanged. Light / dark:

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#ffffff` | `#0b0b0c` | page |
| `--foreground` | `#18181b` | `#f4f4f5` | text (17.7:1 / 17.0:1) |
| `--muted` | `#f4f4f5` | `#18181b` | footer, notice bar, image placeholders |
| `--muted-foreground` | `#52525b` | `#a1a1aa` | secondary text (7.7:1 / 7.9:1) |
| `--accent` | `#f4f4f5` | `#27272a` | hover of quiet controls |
| `--border` | `#e4e4e7` | `#27272a` | dividers, never text |
| `--input` | `#8a8a93` | `#71717a` | borders of controls (3:1 non-text) |
| `--primary` | `--brand` | `--brand` | primary button, links in text, focus ring |
| `--primary-foreground` | `--brand-foreground` | `--brand-foreground` | text on the accent |
| `--ring` | = `--primary` | = `--primary` | focus |
| `--success` / `--warning` / `--destructive` | `#15803d` / `#a16207` / `#b42318` | `#4ade80` / `#facc15` / `#f87171` | status text, always with an icon or a word |
| `--scrim` | zinc-950 at 60 % | black at 72 % | behind the nav sheet, dialogs and the lightbox |

**Your accent.** `--brand` and `--brand-foreground` in `main.css`, once in `:root` (light) and once in `.dark`. The
values and their contrast are written next to them. Rules: text on the accent ≥ 4.5:1; the accent on the background
≥ 4.5:1 in both modes, because links in text use it; in dark mode use a light tint of the accent. Set the light value
as `seo.color` in `ginko.config.ts` too: it fills the share cards. The accents of the Ginko templates:

| Template | Light | Text on it | Dark | Text on it | Headings |
|---|---|---|---|---|---|
| starter | `#18181b` | `#ffffff` | `#f4f4f5` | `#18181b` | Inter |
| blog | `#4f46e5` | `#ffffff` | `#a5b4fc` | `#1e1b4b` | Inter |
| portfolio | `#1c1917` | `#ffffff` | `#f5f5f4` | `#1c1917` | Instrument Serif |
| company | `#0369a1` | `#ffffff` | `#7dd3fc` | `#082f49` | Inter |
| saas | `#6d28d9` | `#ffffff` | `#c4b5fd` | `#2e1065` | Inter |
| restaurant | `#c2410c` | `#ffffff` | `#fdba74` | `#431407` | Fraunces |
| local-business | `#0f766e` | `#ffffff` | `#5eead4` | `#042f2e` | Inter |
| nonprofit | `#15803d` | `#ffffff` | `#86efac` | `#052e16` | Inter |
| events | `#be123c` | `#ffffff` | `#fda4af` | `#4c0519` | Inter |

`.surface-primary` turns a band into the accent colour and swaps text, buttons and the focus ring, so everything in
it keeps its contrast (used by `BlockCta`). A template may give the band its own colour with `--brand-surface` and
`--brand-surface-foreground` in `main.css` (text on it ≥ 4.5:1). Use it in `.dark` when the dark accent is a light
tint: a full-width band of it is the loudest surface on a near-black page. nonprofit: `#14532d` with `#f0fdf4`
(8.7:1) in dark mode; buttons and links keep `#86efac`.

Dark mode: `@nuxtjs/color-mode` puts `.dark` on `<html>` (first visit: the system setting); `dark:` utilities and
`color-scheme` follow it. Printing always uses the light neutrals (paper is white). The navigation, notices, controls and closing band are left
out (`print:hidden`); the footer prints only the name, address, email and phone, so any page prints as its content
with whose it is.

## Type

Inter (variable, latin and latin-ext) through `@nuxt/fonts`, served from the site itself. A display face for headings
is optional (`--font-heading`). Right-to-left languages add their own face on `:lang(…)`.

| Utility | Size | Line height |
|---|---|---|
| `text-h1` | `clamp(2.25rem, 1.5rem + 3.2vw, 4rem)` | 1.05, tracking −0.025em; one per page |
| `text-h2` | `clamp(1.75rem, 1.35rem + 1.7vw, 2.75rem)` | 1.1, tracking −0.02em; sentences such as the `BlockCta` title |
| `text-h3` | `clamp(1.2rem, 1.1rem + 0.45vw, 1.45rem)` | 1.3; section labels and `##` in Markdown |
| `text-lead` | `clamp(1.125rem, 1.06rem + 0.3vw, 1.3125rem)` | 1.5 |
| `text-body` | `1.0625rem` | 1.6 |
| `text-small` | `0.9375rem` | 1.5 |
| `text-xs` | `0.8125rem` | 1.4; the smallest size |

Headings balance their lines and hyphenate (the page sets `lang`). Prices, times and dates use `tabular-nums`
(`<time>` gets it by default). Text runs at most `max-w-prose` (43.5rem, about 65 characters of body text; in rem so the line width does not
change when the web font replaces its fallback).

## Space, size, radius, shadow

| Token | Value | Use |
|---|---|---|
| `pt-section` (`--spacing-section`) | `clamp(3.5rem, 2.25rem + 5.5vw, 7rem)` | space above each section |
| `px-gutter` (`--spacing-gutter`) | `clamp(1rem, 0.5rem + 2.4vw, 2rem)` | page edges (16 px on phones) |
| `max-w-page` | `76rem` | page width |
| `max-w-prose` | `43.5rem` | text width (about 65 characters) |
| `rounded-md` (`--radius`) | `0.625rem` | buttons, controls |
| `rounded-block` | `1rem` | images, cards, the CTA band |
| `shadow-overlay` | one soft shadow | nav sheet, dialog, menus; nothing else |

Tailwind's spacing steps (`p-4`, `gap-6`) stay available.

## Focus and motion

Every interactive element shows a 2px ring in `--ring`, 3px away (`:focus-visible` in `tokens.css`); components do
not draw their own. Motion only for a change of state: 150 ms for colours, 200–300 ms for the sheet, accordion and
dialog, `ease-out`. With `prefers-reduced-motion`, transitions and animations are switched off.

## Components

`app/components/ui/`: shadcn-vue components, copied with the shadcn-vue CLI and trimmed to these:

| Component | Variants |
|---|---|
| `Button` | shadcn-vue's names: `default` (the main action), `outline`, `secondary`, `destructive`, `ghost`, `link`; sizes `default` (44 px), `sm` (36 px with a mouse, 44 px on touch), `lg` (48 px), `icon` (44 px), `icon-sm`, `icon-lg` |
| `Sheet` | `side="start"` (default) or `end`: logical sides, so it opens from the right in right-to-left languages |
| `Accordion` | as in shadcn-vue, on these tokens; only in templates with questions and answers (`BlockFaq`) |

Nothing else until a feature needs it. To add one: `npx shadcn-vue@latest add <name>`, then:

1. Change `import { cn } from 'cn'` to `import { cn } from '@/lib/utils'` and remove the `cn` package the CLI adds.
2. Replace Tailwind default classes (`text-sm`, `shadow-lg`, `rounded-lg`, `bg-black/80`) with the tokens above. In
   the browser they give no error, they just do nothing.
3. Run `npm run lint` and `npm run typecheck`, and look at the component in light and dark. Lint fails on every class
   the theme does not have (`eslint.tailwind.mjs`, which reads `main.css`). A class that is on purpose not Tailwind
   (a hook for plain CSS) goes into the explicit list at the top of that file, with a comment saying why.

Icons come from `@lucide/vue` (what the CLI installs; `lucide-vue-next` is deprecated).

`cn` (`app/lib/utils.ts`) joins classes and resolves conflicts with tailwind-merge, as in shadcn: a
`class="text-small"` on a component that sets `text-h3` wins. tailwind-merge is configured for the theme of
tokens.css (`text-small`, `p-gutter`, `max-w-page`, `rounded-block`…); a new token in `@theme` gets its line there too.

`app/components/site/`: `SiteHeader` (name or logo, up to 6 links, language switch, theme toggle; the links move into
`SiteNavSheet` below `md`, or below `xl` when there are more than 4), `SiteFooter`, `SiteSkipLink`, `SiteLogo`,
`SiteNavLink`, `SiteThemeToggle`, `SiteLanguageSwitch` (the same page in each language), `SiteNotice` (up to two
notices above the header).

`app/components/block/` and two more:

| Component | Use |
|---|---|
| `BlockHero` | home only: the page's h1, a lead, one primary and one secondary action, an optional photo (16:9) |
| `BlockPageHeader` | every other page: h1, lead, optional meta line |
| `BlockSection` | a short label as heading (`text-h3`, the size of a Markdown `##`), optional lead, content; from `lg` heading 4 and content 8 of 12 columns, or full width |
| `BlockCards` | 2–4 per row; the whole card is one link; photos 3:2 |
| `BlockFeatures` | 2–6 items divided by lines, no cards |
| `BlockCta` | a closing band on the accent; one per page, not on legal, contact or error pages |
| `BlockEmpty` | an empty list: what to add, and where (`content/…`) |
| `ProseBody` | a Markdown body (headings start at `##`); with `@lupinum/ginko-components` installed, its components too |
| `InitialsAvatar` | a person without a photo: initials, never a stock face |

## Page patterns

- Home starts with `BlockHero`; other pages with `BlockPageHeader`.
- Section titles are short labels without a full stop; hero and CTA titles are sentences.
- Lists show the date or status a visitor needs, in tabular numbers.
- Every image has a real width, height and alt text, and a fixed ratio per block, so nothing jumps while loading.
- Right-to-left: only logical utilities (`ms-`, `pe-`, `start-`, `text-start`); arrows get `rtl:-scale-x-100`.

## Patterns of the features

In templates that have these features (`templates/_features/` in the Ginko repository):

- **Open now** (`hours`): `HoursToday` says open or closed in words, the dot only repeats it. It stands above the h1 on
  the home page, under the call and email buttons on a page for getting in touch, and at the top of the footer's
  contact column on every page (`app/components/site/FooterStatus.vue`). Opening times never break inside a span:
  a narrow screen breaks between "11:30–14:00 and" and "17:30–22:00".
- **Where** (home): one quiet line under the hero's actions: a pin icon, the address, and an "Open in maps" link
  (`text-small`, muted, the link at least 44 px tall). No embedded map.
- **Getting in touch** (a reservations page): right under `BlockPageHeader`, one primary button (call) and one
  secondary (email), `size="lg"`, full width below `sm`; the open-now line under them; text and the opening hours
  below.
- **A long list** (the menu): under the header, a row of links to its sections (`text-small`, accent, at least 44 px
  tall), so a phone reaches the desserts in one tap; each section has an `id`.
- **Reading** (`blog`): a post's date and reading time in one muted line under the lead, the authors with their
  initials under it; tags as quiet bordered links (at least 44 px tall) after the text; the older and the newer post
  as two bordered links side by side (stacked on phones). In a Markdown text, a photo's caption is an emphasised line
  right under the image (`![Alt text](/media/photo.jpg)`, then `*The caption*` on the next line); long lines in code
  blocks wrap.
- **Photos on phones** (`gallery`): one column at full width, each photo 3:2; justified rows from `sm`.

## Do and don't

| Do | Don't |
|---|---|
| `text-muted-foreground` for secondary text | pick a grey by hand |
| add a token to the CSS and this file | arbitrary values (`p-[13px]`, `bg-[#…]`) |
| one primary button per view, one CTA band per page | the accent behind body text |
| status with a word or an icon, plus colour | colour alone |
| initials for people without a photo | stock faces for named people |
