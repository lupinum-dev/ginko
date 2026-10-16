---
"@lupinum/ginko": minor
---

`offerJsonLd(money, currency, { unitCode })` builds a recurring price: `unitCode` (`MON` per month, `ANN` per year) gives the Offer a UnitPriceSpecification for one such unit, with `valueAddedTaxIncluded` when given. The pricing feature of the templates (templates/_features/pricing/app/composables/usePricing.ts) uses it for the plans' Offers.
