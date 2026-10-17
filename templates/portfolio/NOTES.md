# Notes before release

- Sample data that must change before going live: `content/site.md` (a street called "Musterweg", a phone and VAT
  number with zeros), the email addresses (`example.com`), the people in `content/people/` (fictional), the client
  "Musterbau GmbH" (fictional), the projects, the journal entries, the notice about the Holm chair, the photos (stock
  photos of other rooms and objects, see `MEDIA.md`) and the legal texts (marked placeholders).
- The photos are stock photos that match the sample projects only loosely (the "oak" chair is a light wood chair from
  a stock series).
- Two photos are each used in two projects (`MEDIA.md`), because six photos had to serve four projects with a second
  photo each.
- Nobody has filled the "Responsible for the journal" part of the imprint; it is a marked placeholder like the
  privacy policy.
- German says "Sie" on every page: the studio speaks to clients.
- The home page shows the first three projects in the studio's order; there is no "featured" field. The work page has
  no filter by type: with server rendering a `?type=` filter would work without JavaScript, but `nuxt generate`
  (offered for this template) prerenders one page per address and ignores the query, so the filter would break there.
  With four to twenty projects a studio does not need one.
- Journal entries have no tags: the tag pages are `?tag=` filters too (blog feature), which a static build ignores.
