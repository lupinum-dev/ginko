---
"@lupinum/ginko": minor
---

Add `unitCode` to `offerJsonLd(money, currency, { unitCode })` for a recurring price: `MON` per month, `ANN` per year give the Offer a UnitPriceSpecification for one such unit, with `valueAddedTaxIncluded` when given. The pricing feature of the templates (templates/_features/pricing/app/composables/usePricing.ts) uses it for the plans' Offers.
