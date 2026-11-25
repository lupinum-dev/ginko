---
'@lupinum/ginko-preset-gastro': minor
---

Change the menu's price plan to a dated change: `nextPrice`, `priceFrom`, `priceOn` and `upcomingPrice` are gone, "Change a price" asks "Starts on" (`when: { from: 'ask' }`), and the menu has `timeline: { public: ['price'] }`, so `item.data.price` is today's price and `item.upcoming` holds the coming ones; a site on the preset drops `planned` and the two plan fields with this update, and the platform turns its stored planned prices into dated changes when it updates.
