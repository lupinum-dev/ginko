# Notes before release

- **French (`fr`) and Arabic (`ar`) need a review by a native speaker before this template is released.** They were
  written as a careful translator would, not checked by one. This covers every `*.fr.md` and `*.ar.md` file in
  `content/`, the French and Arabic parts of `notes/feature-content.md`, and the route slugs in `ginko.config.ts`
  (`/fr/...`, `/ar/...`; the Arabic slugs are Latin transliterations because slugs allow only a–z, 0–9 and `-`).
- German: volunteer pages (Get involved, events, news) say "ihr"; Donate, the teachers' part of the water-test post
  and the legal texts say "Sie". One form per page.
- Sample data that must change before going live: `content/site.md` (address in "Musterstadt", register and phone
  numbers with zeros), the IBAN and the donation link on the Donate page, the email addresses (`example.com`), and the
  legal texts (marked placeholders).
- The note on donation receipts (300 euros) describes German rules for a recognised non-profit; the Donate page asks
  the owner to check it.
- `notes/feature-content.md` holds the sample text for the features not built yet (projects, logos and quotes). Turn
  it into content files when those bricks exist, then delete it.
