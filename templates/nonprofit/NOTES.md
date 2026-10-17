# Notes before release

- **French (`fr`) and Arabic (`ar`) need a review by a native speaker before this template is released.** They were
  written as a careful translator would, not checked by one. This covers every `*.fr.md` and `*.ar.md` file in
  `content/`, `i18n/fr.json`, `i18n/ar.json`, the French and Arabic texts of the features (`i18n/<feature>/fr.json`,
  `ar.json`) and the words of the addresses in `app/routes.ts` (the Arabic ones are Latin transliterations because
  slugs allow only a–z, 0–9 and `-`).
- German says "Sie" on every page (decided 15 Oct): the home page's closing band leads to Get involved, which leads
  to Donate, and one journey must not switch between "Sie" and "ihr". Earlier, volunteer pages said "ihr".
- Sample data that must change before going live: `content/site.md` (address in "Musterstadt", register and phone
  numbers with zeros), the IBAN and the donation link on the Donate page, the email addresses (`example.com`), the
  quotes (marked "sample quote"), the partner logos, the sample report PDF, and the legal texts (marked placeholders).
- The note on donation receipts (300 euros) describes German rules for a recognised non-profit; the Donate page asks
  the owner to check it.
- Events: `content/events/` and the `events` brick are in place without an address (`events()` without `route`).
  The next event shows in the home page's closing band and at the top of Get involved (`app/components/event/Next.vue`,
  `app/components/pages/Top.vue`); Today shows it too. When the events feature lands: give the brick its route
  (`localized('/events/[slug]')`, with its words in `segments` of `app/routes.ts`), link the next date to its page,
  add the list and "Events" to the menu, and let "Get involved" link to the dates (today it points to the news).
