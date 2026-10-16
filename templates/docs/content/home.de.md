---
title: Orbit SDK, der TypeScript-Client für die Orbit API.
description: Lege Monitore an, lies Vorfälle und prüfe Webhooks aus Node.js, mit Typen für jede Anfrage und jede Antwort. Orbit SDK wiederholt fehlgeschlagene Anfragen für dich und blättert durch lange Listen.
links:
  - label: Schnellstart
    href: $docs.getting-started
  - label: API-Referenz
    href: $docs.client
features:
  - title: Authentifizierung
    description: Lege einen API-Schlüssel an und behalte ihn auf dem Server.
    href: $docs.authentication
  - title: Paginierung
    description: Lies eine Seite oder mit for await jeden Eintrag.
    href: $docs.pagination
  - title: Fehler und Wiederholungen
    description: Welche Fehler der Client wiederholt und welche dein Code behandelt.
    href: $docs.errors-and-retries
  - title: Webhooks
    description: Bekomm eine Anfrage, wenn ein Monitor ausfällt, und prüfe, dass Orbit sie geschickt hat.
    href: $docs.webhooks
  - title: API-Referenz
    description: Jede Methode mit Parametern und Rückgabetyp, und die Fehlercodes.
    href: $docs.monitors
  - title: Änderungen
    description: Was sich in jeder Version geändert hat, die neueste zuerst.
    href: $page.changelog
---

## Deine erste Anfrage

Orbit prüft deine Websites jede Minute und eröffnet einen Vorfall, wenn eine nicht mehr antwortet. Mit einem API-Schlüssel aus dem Orbit-Dashboard legt dieses Skript einen Monitor für eine Kassenseite an:

```ts [check-shop.ts]
import { Orbit } from '@orbit-example/sdk'

const orbit = new Orbit({ apiKey: process.env.ORBIT_API_KEY })

const monitor = await orbit.monitors.create({
  name: 'Shop-Kasse',
  url: 'https://shop.example.com/checkout',
})

console.log(monitor.id, monitor.status) // mon_8f2k1x pending
```

Der [Schnellstart]($docs.getting-started) erklärt jede Zeile. Orbit SDK läuft auf Node.js 22 oder neuer und in jeder Laufzeit mit `fetch`.
