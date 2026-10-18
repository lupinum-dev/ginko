# Design system

The rules behind this docs site's look. Read them before you change colours, type or the layout, so the site stays
consistent and accessible (WCAG 2.2 AA, light and dark). The look comes from the Nuxt layer `@lupinum/ginko-docs`:
header, search, navigation, page, table of contents, start page, changelog and the Markdown components. This site only
sets its colours and its content.

## Principles

- A quiet, neutral base; the text and the code carry the page. One accent colour.
- Hierarchy from size and weight, not colour. One primary button per view (the first link of the start page).
- Phone first. Every page works at 320 px wide with no horizontal scroll; long code scrolls inside its block.
- Only tokens. Colours, radius and fonts are CSS variables with shadcn names; change a token, not a component.

## Where things live

| What | File |
|---|---|
| Your accent | `app/assets/css/main.css` (`--primary`, `--primary-foreground`, `--ring`, `--accent`, `--accent-foreground`); the light accent again as `seo.color` in `ginko.config.ts` (share cards) |
| Name, logo, links in the footer, "Edit this page" | `app/app.config.ts` (`docs`), the name in `ginko.config.ts` |
| Texts of your own links | `i18n/en.json`, `i18n/de.json` (`docs.footer.<id>`, `docs.nav.<id>`) |
| Everything else (layout, neutral colours, type, components) | the layer `@lupinum/ginko-docs`; its README lists every token |

## Colours

Each token is `light-dark(light, dark)`. The header button switches between them and remembers the reader's choice;
without one the site follows the system. The layer's defaults, emerald on zinc:

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#ffffff` | `#09090b` | page |
| `--foreground` | `#27272a` | `#fafafa` | text (14.9:1 / 19.1:1) |
| `--muted` | `#f4f4f5` | `#27272a` | inline code, buttons, the phone menu's chips |
| `--muted-foreground` | `#6b6b74` | `#a1a1aa` | secondary text (5.3:1 / 7.8:1) |
| `--border` | `#e4e4e7` | `#3f3f46` | dividers, never text |
| `--primary` | `#047857` | `#34d399` | links in text, the main button, the active page (5.5:1 / 10.3:1) |
| `--primary-foreground` | `#ffffff` | `#09090b` | text on the accent (5.5:1 / 10.3:1) |
| `--ring` | `#047857` | `#34d399` | focus ring (2px, 2px away) |
| `--accent` / `--accent-foreground` | `#ecfdf5` / `#065f46` | `#052e22` / `#6ee7b7` | the active page in the navigation (7.3:1 / 9.7:1) |

**Your accent.** Change the five tokens in `main.css` together. Rules: the accent on the background ≥ 4.5:1 in both
modes, because links use it; text on the accent ≥ 4.5:1; the ring ≥ 3:1. In dark mode use a light tint of the
accent. Set the light value as `seo.color` in `ginko.config.ts` too. A second preset is built in:
`docs: { theme: 'green' }` in `app.config.ts` (green on slate).

Code blocks are a dark panel tinted with the accent in both modes (`--ginko-code-*` tokens of
`@lupinum/ginko-components`).

## Type

Inter for text and JetBrains Mono for code, both served from the site itself (`/_docs/fonts/`); Inter is preloaded,
so text does not re-wrap when it arrives. Running text is at most 38rem wide (`--docs-measure`). Change the faces with
`--font-sans` and `--font-mono` in `main.css` (and load the font files yourself).

## Layout

| Token | Default | Use |
|---|---|---|
| `--docs-header` | `4rem` | header height |
| `--docs-sidebar` | `17rem` | side navigation (from 64rem wide) |
| `--docs-toc` | `13.5rem` | "On this page" (from 80rem wide) |
| `--docs-max` | `90rem` | page width |
| `--radius` | `0.75rem` | buttons, code, notes |

Below 64rem the navigation, the site links, the languages and the Auto/Light/Dark switch move into the menu behind
the menu button; search and the light/dark button stay in the header. "On this page" becomes a menu above the page.

## Focus and motion

Every link and button shows a 2px ring in `--ring` when reached with the keyboard. Motion only for a change of state
(the menu fades in in 150 ms); with `prefers-reduced-motion` it does not move.

## Components in the text

The Markdown components (`::callout`, `::steps`, `::code-group`, `::tabs`, `::card` and more) come from
`@lupinum/ginko-components`; Ginko checks every tag and prop when it builds. Use a callout for a warning the reader
must not miss, not for decoration: at most one or two per page.
