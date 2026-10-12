# Ginko: Design v3 (Vorschlag, 8. Oktober 2026)

> Historisch (Stand 8.10.2026). Seit Schritt B (11.10.) ist Markdown das einzige Textformat; `richtext`, AST v1 und `<GinkoRichText>` gibt es nicht mehr. Gültig sind `SPEC.md` und `V1.md`.

Status: v3, Grundlage von `SPEC.md`. Enthält die Funde zweier interner Design-Reviews und die Empfehlungen R1–R6, E1–E9 und I1–I5. Das gebaute Skelett folgt noch dem alten Katalog-Modell.

Leitregel: **Wir streichen, was Risiko erzeugt, statt es abzusichern.** Jede Regel unten verhindert eine ganze Klasse von Fehlern.

## 1. Rahmen

- Eine gehostete Plattform (Nuxt 4 + Convex über better-convex, Vercel) für viele kleine Kundenseiten.
- Kundenseite: Nuxt auf Vercel, eigenes Repo, definiert ihr Schema selbst und liest ein Bundle.
- Hauptziel: **Kein Update und keine Schemaänderung bricht eine Live-Seite, auch nicht beim Rollback.**

## 2. Die sieben Regeln

1. **Schema als Daten in der Seite.** `ginko.config.ts` beschreibt Bausteine, Felder und Aufgaben. Die Plattform führt nie Kunden-Code aus.
2. **Production-Schemas wachsen nur.** Felder kommen dazu, werden aber nie umbenannt, nie im Typ geändert und nie entfernt. „Entfernen“ heißt *zurückziehen*: Das Feld ist im Editor unsichtbar und bleibt mit seinem letzten Wert im Bundle, in v1 für immer. Deshalb versteht jeder alte Code, auch nach einem Rollback, das Bundle weiterhin.
3. **Ein Weg nach production: `ginko release` in CI**, gebunden an den Commit. Ein Release läuft nur, wenn sein Commit noch der neueste auf `main` ist, und einer nach dem anderen.
4. **Migrationen füllen nur neue Felder** (Backfill). Sie laufen atomar in einer Mutation und gehen nur vorwärts. Es gibt kein Undo, stattdessen eine tägliche Sicherung.
5. **Nur zwei Umgebungen: production und lokal.** Previews lesen production lesend. Öffentlich ist nur veröffentlichter production-Inhalt.
6. **Jede Schreiboperation ist gebunden:** an Seite, Basis-Revision und Operations-ID. Kein stilles Überschreiben, keine Doppelungen, kein Zugriff über Seitengrenzen.
7. **Die Seite verträgt Unbekanntes.** Fehlende Felder bekommen den Default aus der eigenen Config. Unbekannte Choice-Werte haben einen Fallback. Rich Text rendert nur erlaubte Knoten.

## 3. Schema

```ts
export default defineSite({
  site: 'sonnenwiese',
  timezone: 'Europe/Vienna',
  locales: ['de', 'en'],                 // optional; erste = Hauptsprache
  bricks: {
    hours: presets.hours,                // Einzelstück
    news: collection({                   // Sammlung, max. Einträge pflichtig
      label: 'Neuigkeiten',
      max: 200,
      route: '/neuigkeiten/[slug]',      // Detailseite, Vorschau, Sitemap
      fields: {
        title: f.text('Titel', { max: 80 }),
        slug: f.slug('Adresse', { from: 'title' }),   // einmal erzeugt, danach fest
        body: f.richtext('Text'),
        kind: f.choice('Art', ['info', 'aktion'], { default: 'info' }),
        image: f.image('Bild', { optional: true }),
      },
      tasks: [{ label: 'Neuigkeit schreiben', add: true }],
    }),
  },
  migrations: {
    // füllt ein NEUES Feld aus alten Daten; läuft einmal beim Release (lokal/CI)
    '2026-11-title-from-headline': { brick: 'news', fills: 'title', from: (e) => e.headline },
  },
  retired: ['news.headline'],            // im Editor weg, im Bundle bleibt der letzte Wert
})
```

- Feldtypen v1: text, longtext, richtext, boolean, date, time, choice, list, image, slug. Optionen: optional, max, hint, default, translate.
- Ein neues **Pflichtfeld braucht einen `default`** oder eine Migration, die es füllt. Der Release schreibt den Wert atomar in alle bestehenden Einträge.
- „Umbenennen“ ist: neues Feld + Migration + altes Feld zurückziehen. „Typ ändern“ (z. B. Text → Rich Text) ist ebenso ein neues Feld. Alter Code liest das alte Feld (Stand vom Release), neuer Code das neue.
- Listen-Zeilen haben stabile IDs. Listen sind klein (max. ~50).
- Die Typen für `useGinko()` kommen direkt aus der Config (Inferenz). Choice-Werte sind typisiert als `'info' | 'aktion' | Unknown`, damit der Code einen Fallback schreiben muss.

## 4. Schema-Release (der wichtigste Ablauf)

```
lokal:  ginko check    → Diff zu production, nötige Migrationen, betroffene Einträge, Größenbudget
CI:     Build ok → ginko release → Vercel-Deploy (promote)
```

`ginko release` macht genau das:
1. Es prüft, dass sein Commit noch der neueste auf `main` ist. Sonst bricht es ab, weil ein neuerer Build übernimmt.
2. Es holt das production-Schema (Revision N), die **Inhalts-Revision C** der Seite (steigt bei jeder Schreiboperation) und die Daten, die die Migrationen brauchen.
3. Es ordnet jede Änderung ein und lehnt alles ab, was nicht wachsen ist: Umbenennen, Typ ändern oder Entfernen ohne `retired`. Die Meldung nennt den richtigen Weg (neues Feld + Migration).
4. Es führt neue Migrationen **lokal** aus. Eine Migration ist eine reine Funktion, wiederholbar und mit Fingerabdruck. Jedes Ergebnis wird gegen das neue Schema geprüft.
5. Es sendet **eine** Mutation: `release({ commit, expectedSchemaRev: N, expectedContentRev: C, schema, writes, migrations: [{ id, fingerprint }] })`. Die Plattform prüft N und C. Hat in der Zwischenzeit jemand etwas geschrieben, auch einen neuen Eintrag, wird abgelehnt, und CI startet den Release neu. Alles oder nichts.
6. Die Plattform speichert jede angewendete Migration mit Fingerabdruck. Eine geänderte Migration unter alter ID wird abgelehnt: Eine Reparatur braucht eine neue ID.
7. Der Release wird mit Commit und Schema-Revision gespeichert. Scheitert danach der Vercel-Deploy, darf der gleiche Commit erneut deployen, ohne die Migration zu wiederholen.

**Größenbudget pro Seite**, damit ein Release immer in eine Convex-Transaktion passt (Limits: 16 MiB lesen und 16 MiB schreiben pro Transaktion, 1 MiB pro Dokument, 16 MiB Argumente): höchstens 4 MiB Inhalt pro Seite, 256 KiB pro Eintrag. Die Plattform prüft das schon beim normalen Speichern, nicht erst beim Release. Das reicht für unsere Seiten mit viel Abstand (300 Einträge à 4 KiB ≈ 2,4 MiB).

Was der Rollback sieht: alten Code mit einem Bundle, das alle seine Felder noch enthält. Ein zurückgezogenes Feld hat den Stand vom Release. Das ist im Notfall akzeptabel, denn die Seite bricht nicht.

## 5. Daten und Bearbeiten

- **Einzelstück:** ein Dokument. **Sammlung:** ein Dokument pro Eintrag (stabile ID, Slug fest nach dem Erzeugen, Änderung nur bewusst mit Weiterleitung).
- Jedes Dokument hat `rev` und pro Feld die Revision der letzten Änderung.
- **Speichern** = Feld-Patch `{ opId, entryId, baseRev, fields }`. Die Reihenfolge auf dem Server:
  1. Anmelden und Rechte prüfen: Gehört der Eintrag zur Seite des Nutzers, und darf er diese Felder ändern?
  2. Ist `opId` für diesen Nutzer und diese Seite schon bekannt? Mit gleichem Inhalt (Hash) kommt das alte Ergebnis zurück. Mit anderem Inhalt wird abgelehnt.
  3. Wurde ein *betroffenes* Feld seit `baseRev` geändert? Dann Konflikt. Andere Felder dürfen sich geändert haben, dann wird zusammengeführt. Eine Liste zählt als ein Feld.
  4. Validieren, Größenbudget prüfen, schreiben, Inhalts-Revision der Seite erhöhen, Verlauf schreiben, Ergebnis unter `opId` speichern.
- Die UI behält ungespeicherte Eingaben bei einem Konflikt und zeigt den neuen Stand daneben.
- **Rückgängig** ist der Gegen-Patch und geht nur, solange diese Felder unverändert sind.
- **Entwurf** (nur Sammlungseinträge): `draft { data, rev, baseRev }` neben `published { data, rev }`. „Veröffentlichen“ schickt `expectedDraftRev` und `expectedPublishedRev` mit. Veröffentlicht wird genau die Fassung, die die Person gesehen hat, sonst kommt ein Konflikt. Es gibt keinen Zeitplan in v1.
- **Ein Produkt, zwei Ansichten:** „Schnell ändern“ (Aufgaben, Handy) und „Alles bearbeiten“ (Felder und Vorschau, Desktop). Ein Speicher-Verhalten.
- **Agent:** Ein Vorschlag ist ein unveränderlicher Patch mit `baseRev` und `schemaRev`. Die Freigabe wendet genau diesen Patch atomar an, sonst gilt er als veraltet. Der Agent hat das Recht „vorschlagen“, nie „speichern“.
- **Rollen:** Lupinum (alle Seiten, Release), Inhaber (eigene Seite, alles), Mitarbeiter (nur benannte Aufgaben, serverseitig geprüft), Agent (Vorschläge).
- **Mandanten:** Die Seite kommt aus der Mitgliedschaft oder dem Schlüssel, nie aus der Anfrage. Jede ID (Eintrag, Verlauf, Vorschlag, Datei) wird gegen die Seite geprüft. Umsetzung mit `@lupinum/better-convex-functions` (`tenant`-Regel) und Tests, die gezielt über Seitengrenzen zugreifen.
- Ehrlicher Name: **konfliktsicheres Bearbeiten**. Gemeinsames Tippen im gleichen Text kommt später.

## 6. Auslieferung

- `GET /bundle/<site>?format=1&locale=<l>`: nur production, nur veröffentlicht. Übersetzbare Felder haben dort den Typ ihres Feldes (String oder AST). Fehlende Übersetzung → Hauptsprache, markiert mit `_fallback`.
- Sammlungen sind im Bundle mit ihrem festen Maximum. Paginierung gibt es in v1 nicht.
- Das Nuxt-Modul setzt **ISR 60 s**. Lädt das Bundle nicht, antwortet die Seite mit **503, nie 404**, und Vercel behält die letzte gute Seite. Eine kalte Route (nie gerendert) liefert ehrlich 503. Ein Content-Check im Deploy prüft, dass das Bundle lädt.
- Nach dem Speichern zeigt die UI: „Gespeichert. Auf der Seite in etwa einer Minute.“ Das ist ehrlich, statt „sofort online“ zu versprechen.
- Das Modul füllt **nur fehlende, neue Felder** mit den Defaults der eigenen Config (Regel 7). Weil production-Schemas nur wachsen, reicht das für Previews: Ein Branch mit neuen Feldern zeigt deren Defaults, bis der Release läuft. Wer Daten für ein neues Feld zeigen will, testet lokal (`ginko pull`).
- **Dringend entfernen** (z. B. ein falscher Preis, ein Rechtsfall): Knopf „Sofort von der Seite nehmen“. Die Plattform ruft den Revalidate-Endpunkt der Seite für die betroffenen Pfade auf. Das ist der einzige Revalidate in v1.
- **Vorschau** läuft auf einem eigenen Pfad: `/__ginko/preview?path=/neuigkeiten/neu&locale=de`. Kein ISR, `no-store`, `noindex`. Das Modul rendert die Ziel-Route mit ihrem Pfad, ihrer Sprache und ihren Parametern. Es liefert nie 404 für unveröffentlichte Einträge, sondern wartet auf die Entwurfsdaten. Links sind in der Vorschau in v1 deaktiviert, die Navigation läuft über die Plattform. Die Nachricht ist gebunden an Origin, das konkrete Fenster, Seite, Sprache und Session-ID. Entwürfe liegen nur in authentifizierten Antworten und im Speicher des Browsers.
- Jeder veröffentlichte Sammlungseintrag hat im Bundle eine **URL-Karte** `{ de: '/neuigkeiten/erdbeeren', en: '/en/news/strawberries' }` mit nur den Sprachen, die es wirklich gibt. Sprachwechsler, hreflang und Sitemap lesen nur diese Karte.
- **Rich Text** ist ein AST v1 mit fester Grammatik: Absatz, Überschrift 2–4, Liste, fett, kursiv, Link. Links dürfen nur `http`, `https`, `mailto`, `tel` oder relativ sein. Die Plattform prüft beim Schreiben, `<GinkoRichText>` aus dem Paket prüft noch einmal. Unbekannte Knoten werden als Text gerendert.

## 7. Mehrsprachigkeit (von Anfang an im Kern)

- Code-Texte bleiben im Repo mit `@lupinum/ginko-i18n`. Die URL bestimmt die Sprache (`prefix_except_default`): Die URLs der Hauptsprache ändern sich nie, auch wenn später Sprachen dazukommen.
- **Jede Seite ist ab dem ersten Tag sprachfähig**, auch wenn sie nur eine Sprache hat:
  - Übersetzbare Felder werden **immer** als `Record<Locale, T>` gespeichert, bei einsprachigen Seiten als `{ de: … }`.
  - Das Bundle wird immer pro Sprache gelesen (`locale=de`). Slugs sind immer pro Sprache gespeichert.
  - Deshalb ist **eine Sprache hinzufügen rein additiv**: `locales: ['de', 'en']` in die Config, Release, fertig. Es gibt keine Migration, und kein Link bricht.
- Welche Felder übersetzbar sind, steht ab dem ersten Tag fest (Standard: text, longtext, richtext, slug, Alt-Text). Eine spätere Änderung daran geht über den Release (Migration).
- Je Übersetzung wird ein Fingerabdruck der Quelle gespeichert. Standard `translate: 'review'`: Der Agent übersetzt, ein Mensch gibt frei. Ein Ergebnis wird nur angewendet, wenn Quell-Fingerabdruck und Ziel-Revision noch stimmen. Manuelle Korrekturen bleiben erhalten.
- Fehlt eine Übersetzung **oder ist sie veraltet** (Fingerabdruck passt nicht mehr zur Quelle), kommt die Hauptsprache, markiert mit `_fallback`. So zeigt die englische Seite nie „offen“, wenn auf Deutsch schon „geschlossen“ steht. Pro Sammlung kann stattdessen `missing: 'hide'` gelten.
- Die Hauptsprache zu wechseln ist brechend und geht über eine Migration. Schnell ändern arbeitet in der Hauptsprache.

## 8. Plattform-Updates

- Verträge: Bundle-Format, Feldtypen, AST v1, Fallback-Verhalten.
- **Jedes Format bleibt unterstützt**, solange eine Seite es anfragt. Ein neues Format kommt dazu, ersetzt aber nie das alte.
- **Kompatibilitäts-Korpus** in `contracts/`: Für jedes Format liegen Beispiel-Schemas, Beispiel-Daten und das erwartete Bundle im Repo. Die Plattform-CI erzeugt die Bundles neu und vergleicht sie. Jede Abweichung bricht den Build. Der Korpus wächst mit jeder echten Seite (anonymisierte Beispiele).
- Neue AST-Knoten oder Feldtypen sind nur additiv. Alte Renderer fallen auf Text zurück.

## 9. Bewusst nicht in v1

Zeitplan („Online ab …“), Paginierung, automatisch live gehende Übersetzungen, gemeinsames Tippen, gemeinsame Dev- oder Staging-Umgebung, `migrate --undo`, Umbenennen/Typänderung im Schema, endgültiges Löschen zurückgezogener Felder (`retire`), Beziehungsfeld `ref`, Revalidate beim normalen Speichern. Formulare: über einen bestehenden Dienst, nicht in Ginko.

## 10. Entschieden (8. Oktober 2026)

R1 Release nur mit dem Production-Deploy (vorläufig ja) · R2 alte Felder bleiben im Bundle (v3: zurückgezogen, in v1 für immer statt 14 Tage, nach Astra v2) · R3 nur vorwärts · R4 production + lokal; lokal läuft eine eigene Kopie der Plattform (`npx ginko dev`, wie `supabase start`), gefüllt mit `ginko pull` · R5 Streichliste wie Teil 9 · R6 ISR-Spike machen · I1–I4 wie empfohlen · I3+: nachträglich mehrsprachig ohne Migration · I5 Mehrsprachigkeit im Kern von Anfang an.

## 11. Offen

- Erster Monat einer echten Seite (Astra): Onboarding des Inhabers, Bilder, SEO-Metadaten pro Seite, Sortierung von Sammlungen, Export und Wiederherstellung. Gehört alles in die Spec der ersten Seite.
- Zeitplan und Beziehungen nur, wenn die erste Seite sie braucht.

- E9: erste echte Kundenseite.
- ISR-Verhalten auf Vercel bei Ausfall, kalter Route und Sitemap: Spike nötig.
- Convex EU-Region, Sicherung und Wiederherstellung pro Seite, Rate-Limit für den Bundle-Endpunkt.
- Seiten-Metadaten (SEO-Titel pro Seite) und Sitemap im Detail.
- Bilder: EXIF/GPS entfernen, Größenlimit, verwaiste Dateien.
