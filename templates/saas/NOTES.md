# Notes before release

- Sample data that must change before going live: `content/site.md` (Planwerk GmbH at Musterstraße 8 in "Musterstadt",
  register, VAT and phone numbers with zeros), the email address and the app addresses (`example.com`,
  `app.example.com`), the plans and prices (`€89` / `€890`, `€219` / `€2,190`, Group on request), the changelog
  (versions 4.3.0 to 4.6.0), the blog posts and their authors (fictional people), the quote (marked "sample quote"),
  the customer logos (fictional homes and a clinic) and the legal texts (marked placeholders for Germany).
- The security and data facts are sample claims about a fictional product, not facts about any real service: "hosted
  in Germany", "data stays in the EU", the data processing agreement under Art. 28 GDPR, encrypted connections and
  nightly encrypted backups in a second German data centre, two-step sign-in, logged support access, 30 days of
  export after cancelling and deletion from backups within 30 more days (`content/home.md` `facts`,
  `content/pages/1.security*.md`, `content/faq/`). The product claims (30-day free trial without payment details, no
  minimum term, swap requests, rule checks, payroll export, single sign-on) are sample claims too. The README's
  "Before you deploy" list asks owners to replace them.
- The picture of the product (`public/media/rota.svg`) is a drawing, not a screenshot: it shows no text and no
  interface the product does not have. Replace it with a real screenshot.
- The pricing page shows both prices of each plan (per month, and per year below it) instead of a monthly/yearly
  switch: it needs no script, and no number on the page is derived (no "save x %"), so a price on the page is always a
  price in the files.
- German says "Sie" on every page, French "vous". The French content is sample text, written for this template
  (EHPAD for care homes); a native check is due before public launch, like the other translations.
- The Studio jobs of this template (gate 7: add a changelog entry, post a notice, change a price) come later in
  `templates/_studio/saas/`.
