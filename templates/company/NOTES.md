# Notes before release

- Sample data that must change before going live: `content/site.md` (address in "Bielefeld", VAT and the
  phone numbers, which start their local part with 0 so nobody can be reached), the email addresses (`.example`), the people in `content/people/`, the quotes (invented people), the customer logos (fictional organisations), the product sheet PDFs (sample address), the
  trade fairs (fictional fairs in fictional towns), the prices (`€390` for the pump check) and the legal texts
  (marked placeholders).
- `content/jobs/summer-internship-assembly.md` is an ad whose last day has passed. It is never shown; it proves that
  an expired job leaves the list, its page, the sitemap and the JSON-LD (gate 3, `_features/jobs/e2e/jobs.spec.ts`).
  The README tells owners to delete it.
- JobPosting `datePosted` is the day the job's file last changed (`updatedAt`, in the site's time zone), else today:
  basics `jobs()` has no posting date, so fixing a typo moves it. If Ginko adds one, use it in `useJobJsonLd`
  (`_features/jobs`).
- Script weight (gate 6, gzip): home 147.7 kB, contact 147.3, product list and pages 152.1, jobs and trade fairs
  150.3, news 151.2. `scriptBudget` is 155 kB (the cap for feature templates is 170); the product pages are the
  heaviest because they load the services and downloads code on top of the shared shell.
- German says "Sie" on every page. Job titles carry "(m/f/d)" / "(m/w/d)", as German job ads do.
- The trade fair pages reuse the events feature; this template renames "Events" to "Trade fairs", its address
  (`/trade-fairs`, `/de/messen` in `app/routes.ts`) and its texts (stand meeting instead of booking a place) in
  `i18n/en.json` and `i18n/de.json`.
