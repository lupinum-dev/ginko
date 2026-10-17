---
"@lupinum/ginko": minor
---

Change a required field with `showWhen` to be required only while it shows: `price: f.money('Amount', { showWhen: { field: 'pricing', is: 'price' } })` now refuses a fixed price without an amount in the build, the Studio and agent tools, and accepts an entry on request without one (templates/_features/services/app/bricks/services.ts).
