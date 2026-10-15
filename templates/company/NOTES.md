# Notes before release

- Sample data that must change before going live: `content/site.md` (address in "Musterstadt", register, VAT and
  phone numbers with zeros), the email addresses (`example.com`), the people in `content/people/`, the quotes (marked
  "sample quote"), the customer logos (fictional organisations), the product sheet PDFs (marked "Sample data"), the
  trade fairs (fictional fairs in fictional towns), the prices (`€390` for the pump check) and the legal texts
  (marked placeholders).
- `content/jobs/summer-internship-assembly.md` is an ad whose last day has passed. It is never shown; it proves that
  an expired job leaves the list, its page, the sitemap and the JSON-LD (gate 3, `_features/jobs/e2e/jobs.spec.ts`).
  The README tells owners to delete it.
- JobPosting `datePosted` is the day the job's file last changed (`updatedAt`), else today: basics `jobs()` has no
  posting date. If Ginko adds one, use it in `useJobJsonLd` (`_features/jobs`).
- A fixed price without an amount (`pricing: price`, no `price`) stops `npm run dev` with the entry's title; a built
  site shows "On request". The Studio cannot require the amount only for `pricing: price` yet (fields have no
  conditional "required"), so an owner could save that state there.
- German says "Sie" on every page. Job titles carry "(m/f/d)" / "(m/w/d)", as German job ads do.
- The trade fair pages reuse the events feature; this template renames "Events" to "Trade fairs" and its texts (stand
  meeting instead of booking a place) in `i18n/en.json` and `i18n/de.json`. The English address stays `/events` (the
  events feature's gate test opens it).
