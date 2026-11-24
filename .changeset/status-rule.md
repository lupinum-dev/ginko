---
'@lupinum/ginko': minor
'@lupinum/ginko-preset-gastro': minor
'@lupinum/ginko-server': minor
'@lupinum/ginko-studio': minor
---

Change the status of a single to a status rule by name: write `status: { rule: 'opening-hours', plans: 'hourPlans' }` in place of `{ show: 'opening-hours', plans }`, and `hours()` of the patterns and of the gastro preset stores `{ rule: 'opening-hours' }` in place of `{ hours: true }`; a schema with the old shape is refused until the site releases again, and the hour plans are read only from the collection `plans` names.
