---
"@lupinum/ginko": minor
---

Add `planned` to `single()` and `collection()`: a field whose value changes on a date (`{ field: 'price', next: 'nextPrice', from: 'priceFrom' }`). The platform stores the planned value only with its date, opens a task on the new value from that date on, leaves the plan out of create tasks (Studio and agent tools), and `ginko check` reports a task that changes the field without showing its plan.
