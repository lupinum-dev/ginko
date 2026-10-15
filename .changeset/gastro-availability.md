---
"@lupinum/ginko-preset-gastro": minor
---

Add availability to the menu and events: a dish can be taken off the menu ("Auf der Karte") or marked sold out for one day (quick task "Gericht heute aus"), an event can be marked fully booked (quick task "Veranstaltung ausgebucht"). `dishOn(dish, date)` gives the rule for the site, and `eventJsonLd` takes `soldOut`.
