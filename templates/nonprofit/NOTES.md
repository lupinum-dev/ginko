# Notes before release

- **French (`fr`) and Arabic (`ar`) need a review by a native speaker before this template is released.** They were
  written as a careful translator would, not checked by one. This covers every `*.fr.md` and `*.ar.md` file in
  `content/`, `i18n/fr.json`, `i18n/ar.json`, the French and Arabic texts of the features (`i18n/<feature>/fr.json`,
  `ar.json`) and the words of the addresses in `app/routes.ts` (the Arabic ones are Latin transliterations because
  slugs allow only a–z, 0–9 and `-`).
- German: volunteer pages (Get involved, events, news) say "ihr"; the home page, Donate, the teachers' part of the
  water-test post and the legal texts say "Sie". One form per page.
- Sample data that must change before going live: `content/site.md` (address in "Musterstadt", register and phone
  numbers with zeros), the IBAN and the donation link on the Donate page, the email addresses (`example.com`), the
  quotes (marked "sample quote"), the partner logos, the sample report PDF, and the legal texts (marked placeholders).
- The note on donation receipts (300 euros) describes German rules for a recognised non-profit; the Donate page asks
  the owner to check it.
- Events: `content/events/` and the `events` brick (Today shows the next date) are in place, but the template has no
  events page yet, so the brick has no address. When the events feature lands: give the brick its route
  (`localized('/events/[slug]')`, the words are already in `app/routes.ts`), add the list to the home page (the slot
  is marked in `app/pages/index.vue`), add "Events" to the menu, and let "Get involved" link to the dates again
  (today it points to the news).
