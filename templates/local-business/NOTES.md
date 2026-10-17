# Notes before release

- Sample data that must change before going live: `content/site.md` (address "Ahornhofgasse 12" in Graz, the
  commented register lines, the sample phone number), the email address (`.example` domain), the people in `content/people/` (fictional
  names and qualifications), the prices in `content/services/`, the phone hours and directions in `content/visit.md`
  (tram stop "Ahornhofplatz"), the notice, the job opening on the About page and the legal texts (privacy policy and
  imprint are marked placeholders for Austria; the payment and cancellation terms are a sample that matches the FAQ).
- `bookingUrl` in `content/visit.md` is left out (a commented line shows its form): the sample books by phone and
  email. With it set, the booking buttons (home, contact, treatment pages) get a third one, "Book online".
- No `vat` in `app/app.config.ts`: physiotherapy is exempt from VAT in Austria, so the price labels say "Price". A
  business whose prices include VAT sets `vat: 'included'` (README, "Prices").
- The closures in `content/hours.md` (a team training day, the Christmas break) and the summer hours in
  `content/hourPlans/` have fixed dates: create-ginko moves only dates of bricks with a `visible` rule (the notices).
  Once a closure has passed it simply no longer shows; the summer hours repeat every year.
- With `holidays: closed`, a public holiday on a day the practice is closed anyway (1 November 2026, a Sunday) is left
  out of the closures (basics' `upcomingClosures`, shared with the restaurant).
- The treatments have no photos: only two photos fit the sample, and cards with and without photos side by side look
  unfinished. The treatment room photo is in the home page's hero and on the About page; both are on the contact page
  ("The practice").
- The home hero shows the treatment room (16:9; beside the text from lg, below the buttons on phones), so the first
  screen shows the place. At 390 px the status, the call button and the phone hours stay above the photo.
- The booking buttons keep one order: call, email, book online (17 Oct 2026). They used to put the email first once
  today was over, but the phone hours are shorter than the opening hours and are free text (`visit.phoneHours`), so
  the site cannot know whether the phone is answered right now. The phone hours stand directly under the call button.
- A treatment's `contact` names the therapist who gives it ("Treated by"); the services feature's own wording for it
  ("Contact person", "Or call …") is replaced by `app/components/services/Actions.vue`.
- German says "Sie" on every page and uses Austrian words where they differ ("Wahlpraxis", "Verordnung", "verrechnen").
- Script weight (gate 6, gzip, 16 Oct 2026, after the booking buttons became one component used by the home, contact
  and treatment pages; every page prefetches the home page's chunks through the logo link): home 153.5 kB, FAQ 155.2,
  team 156.0, contact 157.1, About and legal pages 157.8, the treatments list 160.4, the treatment pages 161.7.
  `scriptBudget` is 165 kB (the cap for feature templates is 170).
