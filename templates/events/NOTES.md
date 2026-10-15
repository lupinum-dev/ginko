# Notes before release

- Sample data that must change before going live: `content/site.md` (the association "Verein Open Data Days" at
  Musterstraße, register and phone numbers with zeros), the venue "Kulturhaus am Kanal, Beispielgasse 12" (a made-up
  address, so "Open in maps" finds nothing), the ticket shop address (`tickets.example.com`), the email addresses
  (`example.com`), the speakers (fictional people), the sessions, the sponsor logos (fictional), and the legal texts
  (marked placeholders for Austria).
- The photos are stock placeholders (Unsplash License, `MEDIA.md`), to be replaced by better-fitting ones before release.
- The past event `content/events/3.last-edition.md` stays in the content as a record; the site never shows it (an
  event leaves the site after its last day). It shows how a finished event looks in the files and in the Studio.
- German says "Sie" on every page.
- The Studio jobs of this template (gate 7: change a session's time, room or status on a phone; post a notice) come
  later in `templates/_studio/events/`.
