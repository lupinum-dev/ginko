# Notes before release

- Everything about Orbit is made up: the SDK, the package `@orbit-example/sdk`, the API at
  `api.orbit.example.com`, the dashboard, the key prefixes, the status codes and limits, and the three releases in
  `content/changelog/`. The Git host and the footer links point at `example.com` (`app/app.config.ts`), so "Edit this
  page" and "Report an issue" lead nowhere until a user sets their repository; the README says so under "Before you
  deploy".
- `content/docs/7.upgrading-to-v2.md` has no German file on purpose. It shows how the layer handles a page without a
  translation (left out of the German navigation and search; German links to it go to the English page; the language
  menu says "Not translated: opens the start page"), and gate 3 (`_features/docs/e2e/docs.spec.ts`) tests that. The
  German changelog entry for 2.0.0 links to it and says "(auf Englisch)".
- German uses "du", as the layer's own German texts do ("Tippe, um Seiten und Abschnitte zu finden").
- The changelog dates (6 October, 25 August, 16 June 2026) are history and never move; `sampleAnchor` is there for
  create-ginko, but this template has no date that shifts.
- Script weight (gate 6, gzip, 390 px): every docs page and the start page 149.8 kB, the changelog 147.2 kB, just under
  the default budget of 150 kB. The layer loads the Markdown components of `@lupinum/ginko-components` on every page;
  KaTeX, mermaid and the search engine load only when a page needs them.
