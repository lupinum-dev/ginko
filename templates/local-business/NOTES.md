# Notes before release

- Sample data that must change before going live: `content/site.md` (address "Beispielgasse 12" in Graz, register
  number and phone number with zeros), the email address (`example.com`), the people in `content/people/` (fictional
  names and qualifications), the prices in `content/services/`, the phone hours and directions in `content/visit.md`
  (tram stop "Beispielplatz"), the notices and the legal texts (marked placeholders for Austria).
- `bookingUrl` in `content/visit.md` is left out (a commented line shows its form): the sample books by phone and
  email. With it set, the home page's hero gets a "Book online" link and the contact page a third button.
- No `vat` in `app/app.config.ts`: physiotherapy is exempt from VAT in Austria, so the price labels say "Price". A
  business whose prices include VAT sets `vat: 'included'` (README, "Prices").
- The closures in `content/hours.md` (a team training day, the Christmas break) and the summer hours in
  `content/hourPlans/` have fixed dates: create-ginko moves only dates of bricks with a `visible` rule (the notices).
  Once a closure has passed it simply no longer shows; the summer hours repeat every year.
- With `holidays: closed`, a public holiday on a day the practice is closed anyway (1 November 2026, a Sunday) still
  shows in the list of closures. That comes from basics' `upcomingClosures`, shared with the restaurant.
- The treatments have no photos: only two photos fit the sample, and cards with and without photos side by side look
  unfinished. The treatment room photo is on the About page; both are on the contact page ("The practice").
- The hero has no photo (BlockHero's no-image state): the first screen answers "open today?", "how do I book?" and
  "what do you treat?" without one.
- German says "Sie" on every page and uses Austrian words where they differ ("Wahlpraxis", "Verordnung", "verrechnen").
