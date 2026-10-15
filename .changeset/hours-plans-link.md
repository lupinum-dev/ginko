---
"@lupinum/ginko": minor
"@lupinum/ginko-preset-gastro": minor
---

Add `hours({ plans: 'hourPlans' })`: the hours name their hour plans in the stored schema (`status: { hours: { plans } }`), the release check refuses a key that is not a collection of hour plans, and the Studio's line for today reads only those plans.
