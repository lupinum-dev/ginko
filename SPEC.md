# Ginko SPEC v4

Grundlage: DESIGN.md v3, DEMOS.md und interne Reviews (v4 schließt die Funde F1–F11 der Review von v3). Diese Spec ist der Vertrag für die Umsetzung. Was hier nicht steht, wird nicht gebaut. Änderungen an dieser Datei macht nur Opus. Wenn ein Worker raten müsste, ist das ein Spec-Fehler: Er meldet ihn unter `issues`, statt zu raten.

**Umfang v1 = Restaurant komplett** (Gasthaus zur Linde). Die Schemas von Industrie und SaaS laufen als **Testfälle** für Schema, Validierung, Diff und Bundle mit. **[v2]** = erst mit Industrie/SaaS.

Begriffe: Seite (site), Baustein (brick), Einzelstück (single), Sammlung (collection), Eintrag (entry), Hauptsprache (erste in `locales`), Blatt (leaf: ein einzelner übersetzbarer Wert, z. B. `days.<rowId>.dish`).

## 1. Pakete

| Paket | Inhalt |
|---|---|
| `@lupinum/ginko` (`packages/ginko`) | `defineSite`, `single`, `collection`, `f.*`, Typen, `serializeSchema`, `validate`, `diffSchema`, `resolveEntry` (Speicher → Bundle-Form), `buildBundle`, `isVisible`, Markdown (`parseMarkdown`, Profile) + `<GinkoMarkdown>`, Nuxt-Modul (`/nuxt`), CLI `ginko` |
| `apps/platform` | Nuxt + Convex: Auth, UI, Operationen, Release, Upload, Bundle-Endpunkt |
| `sites/restaurant` | Demo 1. `sites/industrie`, `sites/saas` folgen in v2 |
| `contracts/` | Schema-JSON, Beispiel-Daten und erwartete Bundles aller Demos je Format (Kompatibilitäts-Korpus) |

`packages/bricks` und `sites/sonnenwiese` werden entfernt. Validierung, Diff, `resolveEntry`, `buildBundle` und `isVisible` gibt es **genau einmal**, im Paket. Plattform und Modul importieren sie.

## 2. Schema

### 2.1 API

```ts
defineSite({
  site: string,                       // /^[a-z][a-z0-9-]{1,40}$/
  name: string,
  url: string,                        // production-URL der Seite
  timezone: string,                   // IANA
  weekStart?: 1|2|3|4|5|6|7,          // erster Tag der Woche (1 = Montag); Standard: aus der Sprache der Hauptsprache (`languages`), z. B. Montag für de-AT, Sonntag für en-US; wird einmal beim Bau des Schemas als `schema.week = { firstDay, weekend }` festgehalten (fehlt es in alten Schemas: Montag, Sa/So)
  locales: [Locale, ...Locale[]],     // jedes kanonische Sprachkürzel (siehe unten), höchstens 20; erste = Hauptsprache
  currency: Currency,                 // ISO-4217-Code (siehe unten), Standard-Währung für money-Felder
  pages: Record<string, string | Partial<Record<Locale, string>>>, // statische Seiten je Schlüssel, z. B. { menu: { de: '/speisekarte', en: '/en/menu' } }; ein Pfad allein = nur Hauptsprache
  bricks: Record<BrickKey, Single | Collection>,   // BrickKey /^[a-z][a-zA-Z0-9]{0,40}$/
  migrations?: Record<MigrationId, Migration>,     // /^\d{4}-\d{2}-[a-z0-9-]+$/
  retired?: Record<RetiredKey, RetiredRule>,       // Teil 2.5
})

single({ label: Label, describe?, fields, tasks? })
collection({ label: Label, describe?, fields, tasks?, max,
  order: 'manual' | { field: FieldKey, dir: 'asc' | 'desc' },   // daterange sortiert nach from, dann to, dann id
  route?: Record<Locale, string>,     // '/veranstaltungen/[slug]', für jede Sprache
  visible?: { mode: 'always' } | { mode: 'active', field: FieldKey /* date */, days?: number } | { mode: 'upcoming', field: FieldKey /* daterange */ },
  missing?: 'fallback' | 'hide',
  autoRemoveExpired?: boolean,        // Teil 4.2 create
  plans?: { brick: FieldKey, field: FieldKey /* date */ } })  // Einträge planen Wochen des Einzelstücks `brick` (Wochen-Aufgabe); `field` hält den ersten Tag der Woche; eine geplante Woche zählt für `staleOf` als eingetragen; deckt sie diese Woche ab, bearbeitet die Wochen-Aufgabe des Einzelstücks diesen Eintrag (Grant und `needsApproval` der Aufgabe gelten), die Sammlung braucht dafür jedes Feld der Aufgabe
```

- `FieldKey` = `/^[a-z][a-zA-Z0-9]{0,40}$/`. Eine `list` darf keine `list` enthalten.
- **`Locale`** ist ein `string`: ein BCP-47-Sprachkürzel, das `Intl.getCanonicalLocales` annimmt **und unverändert zurückgibt** (`es`, `pt-BR`, `zh-Hant`, `de-AT`; nicht `EN-us`, `de_AT`, `DE`). Es ist der Schlüssel jedes übersetzten Werts und das URL-Segment. `isLocale(x)` ist die Laufzeitprüfung; `checkSchema` verlangt sie für jede Sprache und höchstens 20 Sprachen je Seite (`MAX_LOCALES`). Es gibt keine feste Liste.
- **`Currency`** ist ein `string`: ein ISO-4217-Code, der `/^[A-Z]{3}$/` entspricht und in `Intl.supportedValuesOf('currency')` steht (`EUR`, `CHF`, `JPY`, `SGD`, `USD`, …). `isCurrency(x)` ist die Laufzeitprüfung (Seite und `money.currency`). Gespeichert wird immer eine **ganze Zahl in der kleinsten Einheit** der Währung (`amount`): Cent bei EUR, ganze Yen bei JPY (0 Nachkommastellen), Fils bei KWD (3). Die Stellenzahl liefert `minorDigits(currency)` aus `Intl.NumberFormat(...).resolvedOptions().maximumFractionDigits`. `formatMoney(money, locale)` formatiert mit `Intl.NumberFormat(locale, { style: 'currency', currency })`, ohne Länderannahme (`de` ergibt `12,50 €`, `de-AT` `€ 12,50`) und mit festen Leerzeichen.
- **`Label`** = `string | Record<Locale, string>`: überall, wo das Schema ein `label` hat (Baustein, Feld, Option, Aufgabe, Komponente und deren Slots) und für `itemLabel` von Listen. Ein String ist der Text der Hauptsprache und gilt in jeder Sprache; ein Objekt gibt je Sprache einen Text und **muss die Hauptsprache oder Englisch enthalten** (Englisch ist der gemeinsame Rückfall, damit Preset-Labels `{ de, en }` auch auf einer Seite in `es` gelten), jeder Schlüssel ein gültiges `Locale`, jeder Wert ein String (`checkSchema`). Das Schema wächst nur: alte Strings bleiben gültig. `labelOf(label, locale, main)` liefert den Text in `locale`, sonst in `main`, sonst Englisch, sonst den ersten. Kernmeldungen, die ein Label nennen, setzen `labelOf(label, 'de', main)` ein, damit der deutsche Satz lesbar bleibt (`labelRecord`/Anzeige in der Sprache der Person ist Sache des Studios). `hint` und `describe` bleiben vorerst Strings.
- Schema-JSON ≤ 256 KiB, ≤ 30 Bausteine, ≤ 60 Felder pro Baustein.
- `visible` (Standard `always`) gilt für Listen, Detailseiten, URL-Karten und Sitemap gleich, über eine Funktion `isVisible(entry, collection, today)` aus dem Paket. Daten sind inklusiv in der Zeitzone der Seite: `active` = Feld leer oder Feld + `days` (Standard 0) ≥ heute, `upcoming` = `to` ≥ heute. Eine nicht sichtbare Detailseite liefert 404.

### 2.2 Feldtypen

| Typ | Optionen | Gespeichert | Bundle | übersetzbar (Std.) |
|---|---|---|---|---|
| `text` | `max` (≤ 500, mit `format: 'url'` ≤ 2000; Std. 200), `format?: 'url'\|'email'\|'tel'` | string | string | ja, außer mit `format` |
| `longtext` | `max` (≤ 5000, Std. 2000) | string | string | ja |
| `markdown` | `profile?: 'inline'\|'basic'\|'rich'\|'page'` (Std. `rich`), `max` Zeichen (≤ 500 000, Std. 50 000), kein `default` | Markdown-String | Comark-Baum `{ nodes, toc }` | ja |
| `number` | `min`, `max`, `step` (Pflicht), `unit?` | number | number | nein |
| `money` | `min?` (≥ 0), `max?` (≤ 100 000 000), `currency?` (fest, Std. Site-Währung) | `{ amount: int }` in der kleinsten Einheit der Währung (Cent; JPY: ganze Yen) | `{ amount, currency }` | nein |
| `boolean` | – | boolean | boolean | nein |
| `date` | – | `'YYYY-MM-DD'` | gleich | nein |
| `time` | – | `'HH:MM'` | gleich | nein |
| `daterange` | – | `{ from, to }` | gleich | nein |
| `choice` | `options: { value, label }[]` (≤ 50) | value | value | nein |
| `choices` | `options`, `max?` | value[] eindeutig; `[]` = bewusst „keine“ | gleich | nein |
| `list` | `of`, `itemLabel`, `max` (≤ 50), `min?`, `unique?` | `{ _id, …}[]` (`_id` = 10 Zeichen, vom Client, eindeutig in der Liste) | gleich, mit `_id` | je Unterfeld |
| `image` | – | `{ file: FileId, alt: Localized<string> }` | `{ url, alt, width, height }` | nur `alt` |
| `file` | `accept: ['pdf']`, `maxSize` (≤ 10 MB) | `{ file: FileId }` | `{ url, name, size }` | nein |
| `slug` | `from: FieldKey` | `Localized<string>` | string | ja, immer |
| `ref` | `to: BrickKey` (Sammlung), `multiple?`, `max?` (nur mit `multiple`) | Eintrags-ID, mit `multiple` ID[] eindeutig; der Eintrag muss in `to` existieren (`REF_MISSING`) | gleich (IDs, nicht aufgelöst) | nein |

Gemeinsame Optionen: `label` (Pflicht), `hint`, `optional` (Std. false), `default` (**im Speicherformat**, bei übersetzbaren Feldern `Localized`), `translate?: false | 'manual'`.

- **Localized<T>** = `{ [locale]: T }`, immer, auch bei einer Sprache.
- **Slug:** beim Anlegen einmal aus `from` erzeugt (ä→ae, ö→oe, ü→ue, ß→ss, sonst ASCII, Kleinbuchstaben, `-`; bei Kollision `-2`, `-3`). Danach fest. Ändern geht nur mit `entries.changeSlug` [v2]. Eindeutig pro Seite, Baustein und Sprache.
- **Listen-Regeln:** `min` = wenigste Zeilen. `unique` nennt eine Pflicht-Spalte (choice, date, time oder nicht übersetzter text), deren Wert in jeder Zeile verschieden ist. „Jeder Wochentag genau einmal“ = `min = max = Anzahl Optionen` + `unique` auf der Tag-Spalte.
- **Option-Labels** sind Editor-Text (Deutsch) und werden nicht übersetzt. Das Bundle liefert nur Werte (`'A'`, `'vegan'`). Die Seite zeigt sie in jeder Sprache mit ihren eigenen Texten (i18n der Seite). So bleibt der Datenvertrag sprachfrei.
- **Feld-Gruppen** (z. B. eine fertige „SEO“-Gruppe) gibt es in v1 nicht. SEO sind normale Felder.
- **Choice in der Seite:** `useGinko()` typisiert `choice` als `Values | UnknownChoice`.

### 2.3 Validierung

`validate(schema, brick, data, opts)`, mit `opts = { mode: 'create' | 'patch' | 'release', changed?: Set<LeafPath> }`. Ergebnis `{ errors, warnings }` mit `Issue = { path, code, key, params?, message }`: `message` ist deutsch; `key` (Katalog `packages/ginko/i18n/<sprache>.json`, z. B. `issues.tooLong`) und `params` übersetzt `coreMessage(sprache, key, params)` in die Sprache der Person (ein Parameter darf selbst `{ key, params }` sein). Ebenso `fileProblem`, `componentPropMessage`, `parseMarkdown().problemMessages` und `checkLinks`. `checkSchema` bleibt deutsch (für Entwickler).

- **create**, **release**: Alles wird voll geprüft. Pflichtfelder müssen da sein (Localized: Hauptsprache).
- **patch**: Pfade in `changed` werden voll geprüft. Alles andere wird nur gewarnt.
- Unbekannte Schlüssel sind ein Fehler (`Object.hasOwn`). Echte Kalendertage. Zeit 00:00–23:59. `daterange` from ≤ to.
- `money.amount` ist eine sichere ganze Zahl in den Grenzen. `number` liegt in min/max und auf `step`.
- `text` mit format: URL nur `http:`/`https:`, E-Mail `x@y.z`, Telefon `^\+?[0-9 ()/-]{5,30}$`.
- Markdown: Profil und Grenzen siehe Teil 7. `href`/`src` nur `http:`, `https:`, `mailto:`, `tel:`, `/…`, `#…`.
- `choice`/`choices`: nur bekannte Werte. Zurückgezogene Felder werden nicht geprüft.
- Listen: `_id` muss eindeutig sein und `/^[A-Za-z0-9_-]{10}$/` entsprechen.

### 2.4 Diff: Schemas wachsen nur

`diffSchema(prod, next)` gibt `{ changes, rejected }` zurück. **Regel: Alles, was nicht ausdrücklich erlaubt ist, wird abgelehnt.**

Erlaubt:
- neuer Baustein (ein neues Einzelstück wird beim Release angelegt, also braucht jedes Pflichtfeld darin einen `default`)
- neues optionales Feld
- neues Pflichtfeld mit `default` oder mit Migration, die es füllt
- neue Option
- höheres `max`, kleineres `min` (bei `number` nur um ein Vielfaches von `step`, sonst verschiebt sich das Raster gespeicherter Werte)
- Texte (`label` als String oder je Sprache, `hint`, `describe`, `itemLabel`, Option-Labels)
- neue Sprache (am Ende von `locales`)
- `pages`
- `tasks` (Aufgaben sind UI, kein Datenvertrag; entfernte Aufgaben-IDs entfallen aus allen Grants)
- `order` und `visible` (bestimmen nur die Darstellung)
- `plans` (Erinnerung, Anzeige „aktuell“ und welchen Eintrag die Wochen-Aufgabe diese Woche bearbeitet), `missing` (nur Darstellung) und `autoRemoveExpired` (löscht nur nicht sichtbare Einträge, wiederherstellbar 30 Tage)
- Texte `unit`
- neuer Eintrag in `retired`
- neue Migration, die ein Feld füllt, das es in production nicht gibt (Teil 2.6); eine alte Migration aus der Config entfernen (wirkungslos)
- `unique` einer Liste entfernen

Abgelehnt:
- Feld oder Baustein fehlt ohne `retired`
- Typ geändert
- optional → Pflicht
- Option entfernt
- kleineres `max`, größeres `min`
- `step` geändert
- Übersetzbarkeit geändert
- `money.currency` geändert
- Sprache entfernt
- Hauptsprache geändert
- `route` geändert (die Adresse für eine neue Sprache beim Hinzufügen dieser Sprache ist erlaubt)
- `timezone` geändert (verschiebt das Ablaufdatum gespeicherter Einträge)
- `retired`-Eintrag entfernt oder geändert
- `default` geändert (nur Hinzufügen bei neuen Feldern erlaubt)
- `currency` der Seite geändert
- bekannte Migration (gleiche ID) mit anderem Baustein, Feld oder Abdruck
- neue Migration füllt ein bestehendes Feld
- `unique` gesetzt oder geändert

Jede Ablehnung hat `{ path, kind, message, fix }`. `fix` nennt den richtigen Weg, z. B. „Neues Feld anlegen + Migration + altes Feld in `retired`“.

### 2.5 Zurückgezogene Felder (Rollback-Vertrag)

```ts
retired: {
  'menu.headline': { from: 'title' },     // Pflichtfeld: immer der aktuelle Wert von title (gleicher Typ)
  'menu.note': { value: { de: '' } },     // gespeicherter Wert oder dieser Wert
  'menu.badge': {},                       // nur optionale Felder: gespeicherter Wert oder fehlt
  'specials': {},                         // ganzer Baustein: Daten bleiben im Bundle, im Editor weg
}
```
- Ein zurückgezogenes Feld bleibt im Schema-JSON mit `retired: true` (Typ und Optionen unverändert). Im Editor ist es unsichtbar. Im Bundle wird es so projiziert wie oben.
- `from` ist ein nicht zurückgezogenes Feld desselben Bausteins, das **kompatibel** ist: Jeder gültige Wert der Quelle ist ein gültiger Wert des alten Felds. Also gleicher Typ und gleiche Übersetzbarkeit; Quelle Pflicht, wenn das alte Feld Pflicht ist; Grenzen (`max`, `min`, `step`, Format, Währung, Dateitypen) der Quelle liegen in denen des alten Felds; Optionen der Quelle ⊆ alte Optionen; Listen: gleiche Spalten, rekursiv kompatibel; hat das alte Feld `unique`, braucht die Quelle dasselbe. Ein zurückgezogenes Feld behält seine production-Definition (nur Texte dürfen sich ändern). Das Paket prüft das mit `mirrorProblem()` in `checkSchema`. Es gibt keine Kette und keinen Kreis. Ein gespiegeltes Feld übernimmt Wert und `fallback`-Status der Quelle.
- `value` wird gegen das Feld validiert. Felder mit Bildern oder Dateien (auch in Listen) haben keinen `value`: Eine feste Datei hielte kein Eintrag, sie wäre ungeprüft und würde nach 7 Tagen gelöscht.
- Ein Pflichtfeld braucht `from` oder `value`.

### 2.6 Migrationen

```ts
migrations: {
  '2026-11-title-from-headline': { brick: 'menu', fills: 'title', from: (entry, ctx) => entry.headline },
}
```
- Schema-JSON enthält pro Migration `{ id, brick, fills, fingerprint }`. Der Fingerabdruck ist SHA-256 über `brick`, `fills` und **den exakten Quelltext** von `from.toString()`.
- `entry` = gespeicherte Daten. Ist `fills` übersetzbar, wird `from` pro Sprache aufgerufen. Dann ist `ctx.locale` gesetzt, und übersetzbare Felder in `entry` sind für diese Sprache aufgelöst. Fehlt die Quelle in einer Sprache, bleibt das Ziel dort leer.
- Die Funktion ist rein. Sie läuft für alle Einträge, auch gelöschte.
- Sie darf nur ein Feld füllen, das im production-Schema fehlt. Das wird nur für neue IDs geprüft.
- Eine bekannte ID mit anderem Abdruck → `MIGRATION_CHANGED`.
- Ein von einer Migration gefülltes fremdsprachiges Blatt gilt als frisch übersetzt (die Migration ist bewusster Code). Migrationen auf `slug`-Felder sind nicht erlaubt (`INVALID`). Eine Reparatur braucht eine neue ID.

### 2.7 Aufgaben (Tasks) und Rechte

```ts
tasks: [
  { id: 'closedToday', label: 'Heute geschlossen', kind: 'edit', fields: ['closedOn', 'closedNote'], prefill: { closedOn: '@today' } },
  { id: 'edit', label: 'Gericht bearbeiten', kind: 'edit', pick: true, fields: ['name', 'description', 'price', 'allergens', 'veg', 'category'] },
  { id: 'add', label: 'Gericht hinzufügen', kind: 'create' },
  { id: 'remove', label: 'Gericht entfernen', kind: 'remove' },
]
```
- `id` ist eindeutig pro Baustein. `TaskRef = 'brick.id'`.
- `kind`:
  - `edit`: die genannten Felder; bei Sammlungen mit `pick: true` (Eintrag wählen)
  - `create`: neuer Eintrag mit allen Feldern
  - `remove`: Eintrag löschen
  - `restore` ist in `remove` enthalten
- **`prefill` ist nur Vorbelegung im Formular.** Die Query `tasks.prefill({ site, task, entry? })` löst Token (`@today`, `@thisWeek`, `@nextWeek`) auf dem Server in der Zeitzone der Seite auf. `@thisWeek` ist der erste Tag der Arbeitswoche (`schema.week.firstDay`): die laufende Woche, außer an Wochenendtagen nach dem letzten Arbeitstag, dann die kommende (am Wochenende plant man die Woche danach; de: Sa und So, en-US: nur Sa); `@nextWeek` eine Woche später. Die früheren Montag-Token gibt es nicht mehr, `checkSchema` weist sie ab und nennt den neuen Namen. Sie gibt Werte im Speicherformat zurück: Literaltext für übersetzbare Felder kommt als `{ [Hauptsprache]: text }`. Bei `edit` liegen gespeicherte Daten darunter, `prefill` überschreibt. Mutationen wenden **nie** Presets an, sie bekommen immer konkrete Werte.
- Rollen:
  - `admin`: alles, alle Seiten
  - `owner`: alles auf der eigenen Seite
  - `staff`: nur Operationen, die zu einer Aufgabe in `grants` passen. Geprüft werden Aufgaben-ID, Baustein, `kind` und Felder ⊆ `fields`. Lesen ist auf der ganzen Seite erlaubt.
  - Grants mit entfernten Aufgaben-IDs sind wirkungslos.
- `needsApproval?: boolean` (Standard `false`): Änderungen von `staff` mit dieser Aufgabe gehen erst nach einem Ja von owner oder admin live (Teil 17). `diffSchema` erlaubt An- und Abschalten.

## 3. Daten (Convex)

| Tabelle | Felder | Index |
|---|---|---|
| `sites` | `slug, name, url, previewOrigins: string[], schema, schemaRev, contentRev, orderRevs: Record<BrickKey, number>, entryCount, bytes, release: { commit, schemaRev, contentRev, at } \| null, refreshToken (nur intern)` | by_slug |
| `memberships` | `site, user, email?, role: 'owner'\|'staff', grants: TaskRef[]` | by_user_site, by_site |
| `invites` | `site, email, role, grants, tokenHash, invitedBy, expiresAt, acceptedAt?` | by_tokenHash, by_site |
| `admins` | `user` | by_user |
| `entries` | `site, brick, kind: 'single'\|'item', order: number, data, rev, fieldRevs: Record<FieldKey, number>, lifeRev, prints: Record<LeafPath, Record<Locale, string>>, bytes, deletedAt?` | by_site_brick_order, by_site_brick_deleted |
| `slugs` | `site, brick, locale, slug, entry` | by_key (site, brick, locale, slug) |
| `ops` | `site, actor, opId, hash, result, at` | by_site_actor_op |
| `changes` | `site, entry?, brick, actor, opId, kind, sentence, fields?: FieldKey[], before?, after?, printsBefore?, printsAfter?, entryRev?, contentRev, at, undoneBy?` | by_entry, by_site_at |
| `migrationsApplied` | `site, id, brick, fills, fingerprint, schemaRev` | by_site_id |
| `uploads` | `site, uploader, storageId, processedId?, name, size, mime, width?, height?, status: 'processing'\|'ready'\|'failed', attempts, folder?, kept?, sha256?, focus?: { x, y }, trashedAt?, previous?: { storageId, processedId?, replacedAt }[], hasPrevious?` | by_site, by_storage, by_processed, by_status, by_site_folder, by_site_sha256, by_site_trashed, by_previous |
| `folders` | `site, name, parent?` | by_site_parent |
| `fileRefs` | `site, file, holder: 'entry'\|'change', holderId, uses?: { path, missingAlt }[], missingAlt?` | by_file, by_holder, by_site_holder, by_site_missingAlt |
| `views` | `site, user, brick, name, query: { text?, filters?, sort? }` | by_site_user_brick |
| `pushKeys` | `site, hash, label, scopes: ('release'\|'pull'\|'check'\|'export')[], createdBy, revokedAt?` | by_hash |
| `userSettings` | `user, remindByMail, locale?` (kein Eintrag = Erinnerung an, Deutsch) | by_user |
| `reminders` | `site, brick, week, user, at` | by_site_brick_week_user |
| `outbox` | `to, subject, text, at` (nur lokal/Test) | by_to |

- **Revisionen:**
  - `entry.rev` steigt bei jeder Änderung (Start 1 beim Anlegen).
  - `fieldRevs[f]` = `rev` der letzten Änderung von `f`.
  - `lifeRev` steigt bei create, remove und restore.
  - `orderRevs[brick]` steigt bei create, remove, restore und reorder (Start 0).
  - `site.contentRev` steigt nur, wenn gespeicherter Inhalt sich ändert.
  - Eine Operation ohne Änderung (gleiche Werte) ändert keine Revision, legt keine `changes`-Zeile an und gibt das aktuelle Ergebnis zurück.
- **Übersetzungs-Abdrücke** (`prints`):
  - Schlüssel ist das Blatt, z. B. `closedNote`, `days.k3Fd9aZ0qx.dish`, `images.Xy7…alt`.
  - Wird ein fremdsprachiges Blatt **in diesem Speichervorgang geändert**, wird `prints[leaf][locale] = sha256(aktueller Hauptsprach-Wert des Blatts)` gesetzt.
  - Unveränderte fremdsprachige Blätter behalten ihren Abdruck, auch wenn der ganze Wert mitgeschickt wurde.
  - Eine veraltete Übersetzung, die unverändert bleiben soll, wird mit `save({ locale, confirm: [leaf] })` bestätigt. `locale` ist Pflicht und ≠ Hauptsprache; nur diese Sprache wird bestätigt. Jedes bestätigte Blatt zählt für Rechte und Konflikt wie eine Änderung seines Wurzelfelds (Feld ⊆ Aufgabe, `fieldRevs[root] ≤ baseRev`). Eine Bestätigung ist eine echte Änderung: `rev+1`, `fieldRevs[root]`, `contentRev+1` (das Bundle zeigt jetzt die Übersetzung statt der Hauptsprache), `changes`-Zeile.
  - `changes` speichert zu `before`/`after` auch die Abdrücke der betroffenen Blätter (`printsBefore`, `printsAfter`). `undo` stellt Werte **und** Abdrücke wieder her. Ein Undo bestätigt nie eine Übersetzung.
  - Veraltet = Abdruck ≠ aktueller Hauptsprach-Wert. Wird eine Listen-Zeile gelöscht, fallen ihre Abdrücke weg.
- **Datei-Verweise** (`fileRefs`): Es zählt jeder Verweis aus Einträgen (auch gelöschten) und aus `changes` (`before`/`after`). Die Zeilen werden in derselben Mutation gepflegt. Bei Einträgen (`holder: 'entry'`) liefert derselbe Durchlauf, der die Datei-IDs sammelt, auch `uses` (Pfad im Eintrag, Listenzeilen mit ihrer `_id`) und `missingAlt` (ein Bild hat in mindestens einer Sprache der Seite keine Bildbeschreibung); `changes`-Verweise bleiben bloße IDs. `files.rebuildRefs` rechnet die Zeilen aus den Einträgen neu und meldet Unterschiede. Ein Upload ohne Verweis wird nach 7 Tagen gelöscht, ein Upload ohne Verweis und ohne Fertigstellung nach 24 h. Davon ausgenommen sind Uploads mit `kept` (über die Bibliothek hochgeladen oder ausdrücklich behalten), mit `folder` und im Papierkorb.
- **Dateibibliothek** (`convex/files.ts`): `folders` sind ein Baum (`parent`, Namen je Ebene eindeutig, höchstens 80 Zeichen, löschen nur leer). `uploads.folder` legt eine Datei in höchstens einen Ordner; wer sie in einen Ordner legt, setzt `kept`. `sha256` (der Originalbytes, in der Verarbeitung berechnet) gibt die Ansicht „Doppelt“. `focus` ist der Fokuspunkt eines Bildes (0..1). Die Bildbeschreibung gehört zur Verwendung (Bildfeld `{ file, alt }`), nicht zur Datei. Löschen heißt Papierkorb (`trashedAt`) und geht nur, wenn kein Eintrag, auch kein gelöschter, die Datei nutzt. „Ersetzen“ behält die Upload-ID (alle Verweise bleiben), nimmt Inhalt, Größe und Hash der neuen Datei und legt die alte in `previous`. Bibliotheks-Aktionen schreiben keine `changes`-Zeilen (das ist der Inhalts-Verlauf).
- **Budget:** Seite ≤ 4 MiB und ≤ 2 000 Einträge, Eintrag ≤ 256 KiB. Geprüft wird bei jeder Schreiboperation (`TOO_LARGE`).

## 4. Operationen

### 4.1 Gemeinsamer Ablauf jeder Schreiboperation

In **einer** Mutation, in dieser Reihenfolge:
0. `sites.release` folgt Teil 5.2, nicht diesem Ablauf. `entryCount` und `bytes` der Seite pflegt **jede** schreibende Mutation, auch Release und Cron.
1. **Wer:** Session oder Push-Schlüssel mit passendem Scope. Mitglied/Admin der Seite `site`? Sonst `FORBIDDEN`.
2. **Wiederholung:**
   - `opId` (UUID vom Client, pro Nutzeraktion, bei Wiederholung gleich) für (site, actor) bekannt und gleicher Hash der Argumente → gespeichertes Ergebnis.
   - Anderer Hash → `OP_REUSED`.
3. **Was:** Jede ID wird geladen und muss zur Seite gehören (sonst `NOT_FOUND`). Ein zurückgezogener Baustein oder ein zurückgezogenes Feld darf nicht geschrieben werden.
4. **Darf er das:** Rolle und Aufgabe (2.7). Bei `staff` ist `task` Pflicht.
5. **Vorbedingung** je Operation (Tabelle 4.2), sonst `CHANGED_SINCE` mit dem aktuellen Stand.
6. **Prüfen:** `validate`, Slug-Eindeutigkeit (`SLUG_TAKEN`), Budget (`TOO_LARGE`).
7. **Schreiben:** Wirkungen laut Tabelle 4.2, dazu `contentRev+1` (nur bei echter Änderung), eine `changes`-Zeile, `fileRefs`, `ops`-Zeile mit Ergebnis.

### 4.2 Operationen, Vorbedingungen, Wirkungen

| Operation | Argumente (+ `site, opId, task?: TaskRef` — immer `brick.id`, wie in Grants und `tasks.prefill`) | Vorbedingung | Wirkung | Ergebnis | Rückgängig |
|---|---|---|---|---|---|
| `entries.create` | `brick, data` (`_id`s für Listen vom Client) | Sammlung; `validate(create)`; Platz frei. Bei `autoRemoveExpired` werden vorher nicht sichtbare Einträge gelöscht, bis Platz ist | neuer Eintrag `rev 1`, `lifeRev 1`, Slug, `orderRevs+1`, `order` = Ende | `{ entry, rev, contentRev }` | über `remove` |
| `entries.save` | `entry, baseRev, fields: Record<FieldKey, value\|null>, locale?, confirm?: LeafPath[], sentence` | Eintrag nicht gelöscht; kein `f` aus `fields` mit `fieldRevs[f] > baseRev` | Mit `locale` werden übersetzbare Felder nur in dieser Sprache ersetzt, sonst wird der ganze Wert ersetzt. `null` entfernt ein optionales Feld. Eine Liste ist ein Feld | `{ entry, rev, contentRev, warnings }` | ja, `entries.undo` |
| `entries.remove` | `entry, lifeRev` | `lifeRev` gleich; nicht gelöscht | `deletedAt`, `lifeRev+1`, `orderRevs+1`; Slug bleibt reserviert | `{ entry, contentRev }` | über `restore` |
| `entries.restore` | `entry, lifeRev` | gelöscht; `lifeRev` gleich; Platz frei | `deletedAt` weg, `lifeRev+1`, `orderRevs+1`, ans Ende | `{ entry, contentRev }` | über `remove` |
| `entries.reorder` (nur owner/admin) | `brick, order: EntryId[], orderRev` | `order: 'manual'`; `orderRevs[brick] == orderRev`; `order` = genau alle nicht gelöschten Einträge, ohne Doppelte | `order` neu, `orderRevs+1` | `{ orderRev, contentRev }` | nein |
| `entries.undo` | `change` | `change.kind == 'save'`; nicht schon rückgängig; alle `change.fields` mit `fieldRevs[f] == change.entryRev`; Eintrag nicht gelöscht; kein Release mit Migration auf diesen Baustein seit `change.contentRev` (`NOT_UNDOABLE`) | Gegen-Patch: Werte aus `before` **und** Abdrücke aus `printsBefore` (keine neue Bestätigung), Rechte und Revisionen wie `save`, `changes`-Zeile mit `kind 'undo'`, `undoneBy` gesetzt | wie `save` | nein |
| `entries.revert` | `entry, change` | Eintrag nicht gelöscht (sonst `INVALID`: erst wiederherstellen); `change` gehört zu diesem Eintrag und ist noch da (sonst `NOT_FOUND`) | Schreibt `versionAt` als **normales** `save` (`baseRev` = aktuelle `rev`): Rechte, Prüfung, Abdrücke, Datei-Verweise, Freigabe (Teil 17) und Rückgängig gelten wie dort. Nur Felder, die vom aktuellen Wert abweichen; Felder, die das Schema nicht mehr hat, und die Adresse bleiben außen vor. Satz: „Zurück zur Version vom 08.10.2026 12:00“ (Zeitzone der Seite). Kein Unterschied: keine Änderung, keine `changes`-Zeile | wie `save` | ja, `entries.undo` |
| `entries.duplicate` | `entry` (+ `task?`) | wie `create` (Recht, Platz, Budget, Freigabe); Eintrag nicht gelöscht, Baustein eine Sammlung | Legt über denselben Weg wie `create` einen neuen Eintrag mit den Daten des alten an: das erste Textfeld (und das Quellfeld der Adresse) bekommt „ (Kopie)“, wenn es in die Höchstlänge passt, die Adresse wird neu und frei gewählt (`…-kopie`, `…-kopie-2`), Listenzeilen bekommen neue `_id`s, Datei-Verweise werden gezählt. In einer Sammlung mit `drafts` ist die Kopie immer ein Entwurf | wie `create` | über `remove` |

Lesende Queries: `sites.mine`, `sites.get({ site })` (Schema, Einträge, eigene Rolle und Grants), `changes.list({ site, cursor?, entry?, brick? })`, `changes.get({ site, change })`, `entries.versionAt({ site, entry, change })`, `tasks.prefill`, `search.studio`, `views.list`, `entries.trash`, `entries.whyNotPublic`, `sites.translationStatus`.

**Studio-Grundlagen** (lesen darf jedes Mitglied, nur eigene Ansichten):
- `search.studio({ site, query, limit? })`: Treffer in drei Gruppen. `entries` (`entry, brick, brickLabel, label, snippet, state: 'draft'|'live'|'scheduled'`, nie gelöschte) kommen aus derselben Suche wie `ginko_search`; `bricks` und `tasks` (`id` = TaskRef, `label`, nur Aufgaben, die die Person ausführen darf) passen auf ihre Bezeichnung, ohne Rücksicht auf Groß- und Kleinschreibung und Umlaute. `limit` Standard 20, höchstens 50.
- Ansichten (`views`): `views.save({ site, id?, brick, name, query })`, `views.remove({ site, id })`, `views.list({ site, brick })`. Eine Ansicht gehört einer Person und wird nie geteilt (fremde IDs sind `NOT_FOUND`). `query` ist `{ text?, filters?, sort?: { field, dir } }`; Filter und Sortierung nennen nur lebende Felder des Bausteins, sonst `INVALID`. Name 1 bis 60 Zeichen, je Person und Baustein eindeutig (ohne Groß-/Kleinschreibung), höchstens 20 je Person und Baustein. Keine `changes`-Zeile.
- `entries.trash({ site, brick?, cursor? })`: gelöschte, noch wiederherstellbare Einträge, neueste zuerst, 50 je Aufruf (`nextCursor`). Jeder Eintrag hat `deletedAt`, `purgeAt` (= `deletedAt` + 30 Tage, Teil 12), `deletedBy` (aus der `changes`-Zeile) und `mayRestore`; für Staff gelten dieselben Regeln wie bei `restore` (Aufgabe zum Entfernen, keine Freigabepflicht).
- `sites.translationStatus({ site })`: je Baustein und Sprache außer der Hauptsprache die Zahl der Einträge mit `missing` (mindestens ein Text fehlt), `outdated` (nur veraltete Texte) und `ok`, dazu je Eintrag die Blätter (`missing`, `outdated`), höchstens 200 Einträge je Baustein und Sprache (`truncated`); die Summen sind immer vollständig. Es gilt die Regel des Bundles (`fallback`, Teil 6): gezählt werden nicht gelöschte Einträge ohne Entwürfe.
- `entries.whyNotPublic({ site, entry, locale? })`: die Gründe, warum ein Eintrag in einer Sprache nicht auf der Website steht, als Liste `{ code, sentence, blocking, action? }` in deutschen Sätzen: gelöscht (mit Löschdatum), Entwurf, geplant (mit Uhrzeit in der Zeitzone der Seite), Baustein ohne eigene Seite, Zeitraum abgelaufen, Übersetzung fehlt (ohne `blocking`, wenn die Hauptsprache einspringt), Struktur nie veröffentlicht (`release` leer). `public` ist wahr, wenn kein Grund blockiert; dann liefert die Antwort `path` und `url`, falls der Baustein dort eine Seite hat. Ob die Website seit der letzten Änderung neu geladen wurde, speichert die Plattform nicht; dieser Grund fehlt.
- „Jetzt neu laden“ ist `refresh.urgentRefresh` (Teil 4.4), nur Owner und Admin; es gibt keinen zweiten Weg.

**Verlauf:** Jede `changes`-Zeile mit `fields` zeigt ihre Änderung feldweise: `changes.get` liefert die Zeile wie `changes.list` plus `diff: [{ field, label, kind, before, after }]` (`kind` ist der Feldtyp; übersetzbare Felder zusätzlich `locales: [{ locale, before, after }]` nur für geänderte Sprachen, Listen `rows: [{ id, change: 'added'\|'removed'\|'changed', before, after }]` je Zeilen-`_id` und `reordered`). Derselbe Baustein erzeugt den Vergleich eines Vorschlags (`proposals.get`). `entries.versionAt` liefert die Feldwerte eines Eintrags direkt nach einer Änderung: je Feld gibt die früheste spätere Änderung dieses Eintrags, die das Feld berührt hat, den Wert über ihr `before`; ein Feld, das keine spätere Änderung berührt hat, hat seinen heutigen Wert. Änderungen außerhalb der Aufbewahrung (Teil 12) gibt es nicht mehr: `NOT_FOUND`. Beide Queries darf jedes Mitglied lesen wie `changes.list`.

### 4.3 Dateien

1. Der Client holt sich mit `uploads.prepare({ site })` (nur Mitglieder, Session) ein **Upload-Ticket**: zufällig, nur der Hash gespeichert, 10 Minuten gültig, einmal benutzbar, gebunden an Person und Seite. Damit sendet er die Datei per `POST <convex-site>/upload?ticket=…&name=…` (Convex HTTP Action; kein Session-Token im Browser, keine Datei über den Nuxt-Server, bis 20 MB). Die Action löst das Ticket ein (danach ist es weg; abgelaufen oder Person kein Mitglied mehr → 403), prüft Typ (Bilder: jpeg, png, webp, heic, je 20 MB; pdf, 10 MB), Größe und die ersten Bytes, speichert mit `ctx.storage.store()` und ruft die interne Mutation `uploads.register` für **genau diese Person und Seite**. Eine gespeicherte Datei gehört so von Anfang an jemandem; es gibt keinen Schritt, in dem eine fremde storageId beansprucht werden kann. `register` legt `uploads { site, uploader, storageId, status: 'processing' }` an und plant **in derselben Transaktion** die Prüfung und Verarbeitung. Scheitert `register`, löscht die Action die Datei sofort; der tägliche Cron löscht zusätzlich Storage-Dateien ohne `uploads`-Zeile (älter als 24 h) und abgelaufene Tickets.
2. Eine geplante Node-Action (`"use node"`, sharp als external package) prüft zuerst die ersten Bytes gegen den angegebenen Typ (sonst `failed`, „Der Inhalt passt nicht zum Dateityp.“). Ein PDF ist dann `ready` wie gespeichert. Bilder verarbeitet sie: EXIF/GPS entfernen, Kante max. 2400 px, WebP. Sie speichert das Ergebnis neu und ruft eine Mutation, die **zuerst** `processedId`, Maße und `status: 'ready'` schreibt und im selben Schritt das Löschen des Originals plant (wiederholbar). Bei einem Fehler wird bis zu 3× wiederholt (`attempts`), dann `failed`.
3. Felder dürfen nur auf `ready`-Uploads der eigenen Seite zeigen, die nicht im Papierkorb liegen (`FileId` = uploads-ID).
   - `uploads.prepare({ site, folder?, library? })` legt das Ziel ins Ticket; mit `library: true` oder `folder` ist der Upload `kept`. `markReady` und `markFileReady` speichern den SHA-256 der Originalbytes.
   - **Bibliothek** (`files.*`, nur die eigene Seite; fremde IDs sind `NOT_FOUND`): lesen (`list`, `info`, `folders`) und hochladen dürfen alle Mitglieder; Ordner anlegen, umbenennen, verschieben, löschen sowie Dateien verschieben, umbenennen, Fokus setzen, behalten, in den Papierkorb legen, zurückholen und ersetzen dürfen nur Inhaber und Admins (`FORBIDDEN` für Staff).
   - `list({ site, view, folder?, search?, cursor? })`: Ansichten `all`, `recent`, `unused` (bereit, nicht im Papierkorb, ohne Eintrags-Verweis), `missingAlt`, `duplicates` (gleicher `sha256`), `trash`; 50 pro Aufruf, neueste zuerst, `cursor` für die nächste Seite.
   - `info({ site, file })` liefert Datei, URL, Fokus, einen Vorschlag für die Bildbeschreibung (die zuletzt gespeicherte nicht leere) und `usedIn` je Eintrag (`entry, brick, title, paths, missingAlt, deleted`).
   - `trash({ site, files })` legt nur ungenutzte Dateien in den Papierkorb und gibt die abgelehnten mit ihrem Verwendungsort zurück.
   - `replace({ site, file, upload })`: `upload` ist eine neue, auf dem üblichen Weg (Ticket, POST /upload, Verarbeitung) hochgeladene, fertige und noch unbenutzte Datei der gleichen Art (Bild für Bild, PDF für PDF); ihre Zeile entfällt, `file` übernimmt ihren Inhalt.
4. Datei-URLs sind für jeden mit der URL öffentlich. Das ist für v1 akzeptiert.

### 4.4 Sofort von der Seite nehmen

`refresh.urgentRefresh({ site, opId })` (owner, admin; Staff ist `FORBIDDEN`), als Action:
1. `min = (site.schemaRev, site.contentRev)`.
2. Pfade = `pages` aller Sprachen + `/sitemap.xml` + die URLs **aller** Einträge mit Route, ob sichtbar oder nicht und auch gelöschte (bis zur endgültigen Löschung nach 30 Tagen). So fehlt keine Seite, die durch Bearbeiten, Ablauf, Löschen oder ein Release unsichtbar wurde, und es braucht keine Buchführung in `changes`. Normalisiert, nur relativ, ohne Doppelte, höchstens 500 (sonst nur Seiten + Sitemap und Hinweis).
3. Für jeden Pfad, in Stapeln zu 20: `GET <site.url><path>` mit den Headern `x-prerender-revalidate: <refreshToken>` und `x-ginko-min-rev: <schemaRev>.<contentRev>`. Weiterleitungen werden nicht verfolgt.
4. Das Modul gibt den Header unverändert als `minRev` an den Bundle-Abruf weiter. Ist eine der beiden Zahlen des Bundles kleiner, antwortet der Endpunkt `STALE`, das Modul liefert 503 (die alte Seite bleibt). Die Plattform wiederholt einen Pfad nach 5 s, höchstens 3×, wenn die Antwort 503 ist **oder** der Beleg (Schritt 5) fehlt oder zu klein ist. Danach meldet sie den Pfad als Fehler.
5. Ein Erfolg wird belegt: Das Modul setzt auf **jeder** Antwort (HTML, `/sitemap.xml`, echte 404) den Header `x-ginko-rev: <schemaRev>.<contentRev>` des verwendeten Bundles. Die Plattform prüft beide Zahlen ≥ `min`. Dass Vercel den Header mit der Seite zwischenspeichert und `allowQuery: []` Queries zusammenführt, prüft der Deploy-Test in Phase 10 (Fertig-Kriterium).
6. Ergebnis: `[{ path, status, rev }]`. Die UI zeigt „Neu geladen: 12 Seiten“ oder die Fehler.

`refreshToken` = das Vercel-Bypass-Token der Seite. Es steht als Env-Variable in der Seite (`NUXT_GINKO_REVALIDATE_TOKEN`) und in `sites.refreshToken`, gesetzt durch admin. Ob Vercel die Header so durchreicht, prüft der ISR-Spike.

## 5. Release

### 5.1 CLI `ginko release` (CI: `GINKO_PLATFORM`, `GINKO_KEY`, `GITHUB_SHA`)

1. Ist HEAD von `main` (`git ls-remote origin main`) ≠ `GITHUB_SHA`, gibt es `{"deploy":false,"reason":"superseded"}` aus, Exit 0.
2. `GET /release/state` (Key-Scope `release`) liefert: Schema, `schemaRev`, `contentRev`, angewendete Migrationen und die Daten **aller** Einträge der Seite, auch gelöschter. Das passt ins Seiten-Budget (≤ 4 MiB) und erlaubt die volle Prüfung des Kandidaten.
3. `diffSchema`. Bei Ablehnungen Erklärung ausgeben, Exit 1.
4. Kandidat bauen: Migrationen ausführen, neue Defaults einsetzen, neue Einzelstücke anlegen. Dann `validate(release)` auf dem Kandidaten.
5. Mutation `sites.release`. Bei `CHANGED_SINCE` geht es zurück zu 1, höchstens 5×, Wartezeit 2/4/8/16/32 s.
6. Ausgabe: `{"deploy":true,"schemaRev":<aus Antwort>,"contentRev":<aus Antwort>}`, Exit 0. Ein Fehler gibt Exit 1.

CI (GitHub Actions):
- `concurrency: { group: ginko-release-<site>, cancel-in-progress: false }` über Release **und** Vercel-Promote.
- Promote läuft nur bei `deploy == true`.
- Scheitert Promote, darf derselbe Commit erneut laufen.

### 5.2 Mutation `sites.release`

Argumente: `{ site, commit, expectedSchemaRev, expectedContentRev, schema, writes: { entry, fields }[] }` (Push-Schlüssel mit Scope `release`).

1. Gilt `site.release.commit == commit`, kommt die gespeicherte Antwort zurück (`{ schemaRev, contentRev }` dieses Releases), ohne Änderung.
2. `schemaRev ≠ expectedSchemaRev` → `CHANGED_SINCE`.
3. `diffSchema(gespeichert, schema)` auf dem Server. Ablehnungen → `SCHEMA_REJECTED`.
4. Migrationen aus `schema.migrations`:
   - Bekannte ID mit gleichem Abdruck → überspringen. Mit anderem Abdruck → `MIGRATION_CHANGED`.
   - Neue IDs: `fills` darf im gespeicherten Schema nicht existieren.
5. Gibt es neue Migrationen oder Writes, muss `contentRev == expectedContentRev` gelten (`CHANGED_SINCE`, die CLI wiederholt). Sonst wird `contentRev` nicht geprüft. Dieser Schritt kommt **vor** der Vollständigkeit, damit ein neuer Eintrag während des Releases zu `CHANGED_SINCE` führt und nicht zu `MIGRATION_INCOMPLETE`.
6. **Vollständigkeit, immer geprüft:** Jedes Ziel einer neuen Migration hat für **jeden** Eintrag des Bausteins (auch gelöschte) genau einen Write mit genau diesem Feld (`MIGRATION_INCOMPLETE`). Writes auf andere Felder → `MIGRATION_INCOMPLETE`.
7. **Kandidat auf dem Server:** Writes zusammenführen, neue Pflicht-Defaults in alle Einträge (auch gelöschte), neue Einzelstücke mit Defaults. Dann `validate(release)` für jeden betroffenen Eintrag (`INVALID`).
8. Schreiben: Schema, `schemaRev+1`, Einträge (`rev+1`, `fieldRevs`), `migrationsApplied`, `contentRev+1` nur wenn Einträge sich geändert haben, `release = { commit, schemaRev, contentRev, at }`, eine `changes`-Zeile (`kind: 'release'`).
9. Grenzen: ≤ 4 000 geschriebene Dokumente, ≤ 8 MiB Argumente, ≤ 4 000 Writes (`RELEASE_TOO_LARGE`).

### 5.3 Lokal

`ginko dev` pusht das Schema an die lokale Plattform (Mutation `sites.devPush`, nur wenn die Plattform mit `GINKO_LOCAL=1` läuft). Abgelehnte Änderungen gehen mit Warnung durch. `ginko check` = 5.1 Schritte 2–4 gegen production, ohne Schreiben, plus Budget.

## 6. Bundle

`GET <platform>/bundle/<site>?format=3&locale=<l>[&minRev=<schemaRev>.<contentRev>]`. Die Plattform leitet an eine Convex HTTP Action weiter.

```jsonc
{
  "format": 3, "site": "restaurant",
  "locale": "de",                 // aufgelöste Sprache
  "requestedLocale": "en",        // nur wenn abweichend
  "locales": ["de"], "mainLocale": "de",
  "schemaRev": 7, "contentRev": 412, "generatedAt": "…",
  "bricks": {
    "hours": { "kind": "single", "data": { … }, "fallback": ["closedNote"] },
    "events": { "kind": "collection", "items": [
      { "id": "…", "data": { … }, "fallback": [], "urls": { "de": "/veranstaltungen/weinabend" }, "updatedAt": "2026-10-05T09:00:00.000Z" }
    ] }
  }
}
```

- `resolveEntry(schema, brick, entry, locale, today)` aus dem Paket macht aus den gespeicherten Daten die Bundle-Form. Sie löst Localized auf, nimmt bei fehlender oder veralteter Übersetzung die Hauptsprache und listet das Blatt in `fallback` (Pfade wie `days.k3Fd9aZ0qx.dish`). Außerdem projiziert sie zurückgezogene Felder (2.5) und Dateien.
- **Sammlungen** enthalten alle nicht gelöschten Einträge in Reihenfolge, auch nicht sichtbare (die Seite filtert mit `isVisible`). `urls` gibt es nur für sichtbare Einträge mit `route`, und nur in Sprachen, in denen der Eintrag existiert (bei `missing: 'fallback'` in allen; fehlt der eigene Slug, gilt der Slug der Hauptsprache, in Bundle und URL gleich). Bei `missing: 'hide'` fehlt ein Eintrag, wenn ein übersetzbares Pflichtfeld veraltet ist oder fehlt.
- **`updatedAt` und `source` (Format 3):** Jeder Sammlungseintrag trägt `updatedAt` (ISO 8601, UTC): wann er sich zuletzt geändert hat. Plattform: Zeit der letzten Inhaltsänderung des veröffentlichten Eintrags (`create`, `save`, `confirm`, `undo`, `restore`, `publish` in `changes`); Entwurfs-Änderungen zählen erst ab dem `publish`. Ist die Änderung schon aus `changes` gelöscht (Aufbewahrung), gilt die Anlagezeit. Dateien: letzter Commit, der die Hauptdatei oder eine Übersetzung berührt hat (ein `git log` pro Build); eine geänderte, neue oder nicht versionierte Datei, oder kein Repository: Zeit der Datei. `source` gibt es nur für Dateieinträge: Pfad der Datei dieser Sprache relativ zum Repository (POSIX), z. B. `content/docs/1.einstieg.en.md` im englischen Bundle; ohne Übersetzungsdatei die Hauptdatei. Beide Felder sind optional; Format 2 (ohne beide) wird von `isBundle` noch gelesen, die Plattform liefert nur Format 3 (`format=2` → 400).
- **Unbekannte Sprache:** 200. Dabei ist `locale` = Hauptsprache, `requestedLocale` = angefragt, alle übersetzbaren Blätter stehen in `fallback`, `urls` enthält nur echte Sprachen.
- Antworten:
  - 200
  - 404 `SITE_NOT_FOUND`
  - 400 `FORMAT_UNSUPPORTED`
  - 409 `STALE` (`schemaRev` oder `contentRev` kleiner als in `minRev`; beide Zahlen werden verglichen)
  - 429 `RATE_LIMITED`
  - 503 intern
- Header: `Cache-Control: no-store`, `Access-Control-Allow-Origin: *`.
- Rate-Limit: 600 Anfragen pro Minute und Seite (Convex Rate Limiter).
- **Jedes Format bleibt für immer ausgeliefert.** Der Korpus in `contracts/` prüft jedes Format.

## 7. Markdown (ein Textformat)

Text ist überall ein Markdown-String in comark-Syntax: in Git-Dateien, auf der Plattform, im Editor, in Agenten-Tools. `parseMarkdown` (Kern, `core/markdown.ts`, comark 0.7) ist der einzige Parser.

Profile (jedes erlaubt alles der vorigen):
- `inline`: ein Absatz; fett, kursiv, durchgestrichen, Code, Links, Zeilenumbruch
- `basic`: Absätze, Überschriften h2–h4, Listen, Zitate, Hinweise (`> [!NOTE]`), Trennlinie, Fußnoten (`[^1]`); Emoji-Kürzel (`:tada:`) gelten in jedem Profil
- `rich`: Tabellen, Bilder, Code-Blöcke, Aufgabenlisten, Formeln (`$x^2$`, `$$…$$`), Mermaid-Diagramme (Code-Block `mermaid`)
- `page`: h1, h5, h6 und Komponenten (`::callout`, `:badge[…]`); gesperrt bleiben `script`, `style`, `iframe`, `form` und andere Tags, die Code ausführen, Inhalte laden oder Daten senden (bis die Komponenten-Registry nur registrierte erlaubt)

Regeln:
- Rohes HTML wird nie geparst: `<b>` bleibt Text.
- `href`, `src` und andere Adress-Eigenschaften müssen `isSafeHref` bestehen; `on…`-Eigenschaften sind verboten.
- Route-Links `$baustein.slug` und `$page.key` (`resolveRouteLinks`, `core/links.ts`) und `::snippet{name}` werden beim Bauen aufgelöst; `checkLinks` prüft Bündel vor dem HTML (CONTENT.md, „Links zwischen Seiten“).
- Weiterleitungen (`core/redirects.ts`): alte URLs antworten mit 301 auf die neue, aus `redirects` in `defineSite` (Muster `:name`, `*`) und `redirectFrom` im Frontmatter einer Inhaltsdatei; eine Nitro-Middleware wertet beides aus (Konfiguration zuerst), bei reinen Datei-Bausteinen zusätzlich `routeRules` für statische Hosts. `links.redirected` (Standard `warn`) meldet interne Links auf alte URLs.
- ≤ 20 000 Knoten; Länge laut `max`.
- `validate` ist async, weil es den Text parst; Profilfehler haben den Code `MARKDOWN`.
- Ein Profil verengen ist eine inkompatible Schemaänderung.

**Komponenten-Register** (`core/components.ts`): `defineSite({ components })` nimmt ein Register `Tag → ComponentDef` (`defineComponents`): `kind` (`block`/`inline`), `label`, `describe`, `props` (Ginko-Felder: text, longtext, number, boolean, choice, choices, image, ref), `slots`, `children`, `parents`, `editor`. Es gehört zum Schema-Vertrag (`schema.components`; `checkSchema` prüft es mit `componentProblems`: Tag kebab-case, kein Markdown-/gesperrter Tag, nur diese Feldtypen, `children`/`parents` nennen Tags des Registers). `validate` und `parseMarkdown(text, { components })` prüfen im Profil `page`: unbekannte Komponente, unbekannte oder fehlende Eigenschaft (Pflicht, außer `optional`), Wert nach Typ (Attribute sind Strings: Zahl, `true`/`false`, Option, `choices` mit Komma), `parents`/`children` am Baum. Ein Block-Tag mitten im Absatz ist ein Fehler; ein Inline-Tag ist überall erlaubt, weil comark `::x` und `:x[…]` am Textanfang nicht unterscheidet. Gesperrte Tags bleiben immer gesperrt (`BLOCKED_TAGS`); die einzige Ausnahme ist `template`, comarks Slot-Knoten (`#name` in einer Komponente): erlaubt nur als direktes Kind einer Komponente des Registers, deren `slots` den Namen nennt (`componentSlotNodes`, `checkComponentTree`); ein undeklarierter Name, ein `template` anderswo und jedes `template` ohne Register bleiben Fehler. Ohne Register gilt wie bisher „alles außer gesperrt“.

Auslieferung: Das Bundle trägt den Baum (`withMarkdownTrees` am Bundle-Endpoint und in der Studio-Vorschau). Seiten brauchen keinen Parser. `<GinkoMarkdown :value>` rendert den Baum über `@comark/vue`, ohne `v-html`. Bilder tragen `width`/`height`; `<GinkoImage :image>` rendert Bildfelder mit Größe, Bilder neben Dateiinhalten siehe CONTENT.md „Bilder“.

## 8. Nuxt-Modul `@lupinum/ginko/nuxt`

- Option `ginko` = `defineSite`-Ergebnis. `runtimeConfig.public.ginko = { site, platform, locales, mainLocale }`. Die Plattform-URL lässt sich per `NUXT_PUBLIC_GINKO_PLATFORM` überschreiben.
- **Sprache:** kommt aus `@lupinum/ginko-i18n` (Route-Sprache), sonst die Hauptsprache.
- **Ein Bundle-Anbieter:** Das Bundle liegt in `useState('ginko:bundle')`. Normal wird es einmal pro Request geladen (`useAsyncData`). In der Vorschau kommt es nur per Nachricht. Alle Composables lesen nur diesen State, deshalb ruft in der Vorschau nichts production ab.
- **Defaults für Felder, die im Bundle fehlen:** Ein Feld, das die eigene Config kennt, wird aus seinem `default` (Speicherformat) per `resolveEntry` in Bundle-Form gebracht. Fehlt ein ganzer Baustein, wird ein Einzelstück aus Defaults erzeugt, und eine Sammlung ist leer.
- **Fehler:** Netz, 5xx, 409, 429 oder falsches Format → `createError({ statusCode: 503, fatal: true })`. Nie 404 wegen der Plattform. 404 nur bei echtem Nicht-Gefunden (`useGinkoEntry`, nicht sichtbar).
- **ISR:** `routeRules['/**'] = { isr: { expiration: 60, allowQuery: [] } }`, Bypass-Token aus `NUXT_GINKO_REVALIDATE_TOKEN` (`nitro.vercel.config.bypassToken`). Ohne `allowQuery: []` bekommt jede Query (z. B. `?utm_source`) einen eigenen Cache-Eintrag, den ein Refresh nicht trifft (ISR-Spike, Frage 5). Ausgenommen mit `isr: false` und `no-store`: `/__ginko` **und** `/__ginko/**` (die Wildcard allein deckt den exakten Pfad nicht, ISR-Spike). Der Header `x-ginko-min-rev` geht als `minRev` an den Bundle-Abruf; ein ungültiger Wert wird ignoriert. Jede Antwort trägt `x-ginko-rev` (Teil 4.4).
- **Status-Regel (ISR-Spike, live gemessen):** 503 behält die alte gute Seite im Cache, 404 ersetzt sie. Darum 404 nur bei bestätigter Abwesenheit. Eine kalte Route im Fehlerfall liefert 503; Vercel kann den Fehler-Body ersetzen.
- **Header:** `Content-Security-Policy: frame-ancestors 'self'`, außer auf der Vorschau-Route: `frame-ancestors <platform-origin>`.
- **Vorschau** `/__ginko/preview?path=<p>&locale=<l>&session=<uuid>`:
  - `no-store`, `X-Robots-Tag: noindex`.
  - `path` muss relativ sein, ohne `//`, `\` und `..`, und zu einer bekannten Route passen (Nuxt-Router `resolve`). Sonst Fehlerseite.
  - Ablauf:
    1. Hülle rendern und `{ type: 'ginko:ready', session }` an `window.parent` senden (targetOrigin = Plattform).
    2. Angenommen wird nur `{ type: 'ginko:preview', session, site, locale, bundle }`, und nur bei `event.source === window.parent`, Origin = Plattform und passender session, site und locale.
    3. Dann rendert die Hülle die Ziel-Route mit ihren Parametern über den Router, mit diesem Bundle.
    4. Nach 5 s ohne Nachricht erscheint „Vorschau lädt nicht“.
  - Die Hülle hat kein Layout (`layout: false`). Eine Seite legt alles, was Inhalte liest (Kopf, Fuß, SEO), in ein Nuxt-Layout, nicht in `app.vue`: Bis das Bundle per Nachricht da ist, gibt es keine Inhalte.
  - Links sind deaktiviert. Ein Klick sendet `{ type: 'ginko:navigate', session, path }`.
  - Die Plattform-Seite prüft `event.source === iframe.contentWindow`, Origin ∈ {`site.url`, `site.previewOrigins`} und session. Bei `navigate` prüft sie den Pfad (relativ) und startet eine neue session.
- **Composables:**
  - `useGinko(brick)` → `ComputedRef` mit `data` oder `items` (typisiert)
  - `useGinkoEntry(brick, slugParam)` → Eintrag oder 404
  - `useGinkoQuery(brick, q)` → `{ items, total, page, pages, facets? }`: Kern-`query` (where, order, limit, page, facets) über die sichtbaren Einträge im Client-State; kein Server-Aufruf. `q` darf Ref oder Getter sein. Einträge mit Route tragen `url`.
  - `useGinkoNeighbors(brick, id, order?)` → `{ prev?, next? }` unter den sichtbaren Einträgen.
  - `useGinkoNav(bricks)` → Navigationsbaum (`navTree`) der sichtbaren Einträge in der aktuellen Sprache; `useGinkoBreadcrumbs(bricks)` → Pfad von der Wurzel bis zur aktuellen Route.
  - Sprache, Sprachwechsel, hreflang und canonical: `@lupinum/ginko-i18n` (`useI18n()`, `alternates`). Das Modul installiert es mit den Sprachen aus `ginko.config`; Detailseiten bekommen ihre URLs pro Sprache aus dem Bundle.
  - `useGinkoToday()` → heutiges Datum in der Zeitzone der Seite. Zuerst der Wert des Servers; im Browser geht es nach Mitternacht weiter (gleich nach dem Laden, jede Minute, beim Zurückkehren in den Tab). `useGinko` filtert damit, also verschwinden abgelaufene Hinweise ohne Neuladen.
  - `isVisible` und `formatMoney(money, locale)` (`12,50 €` auf Deutsch, `€12.50` auf Englisch, `¥1,250` für JPY; Betrag in kleinster Einheit)
- **Sitemap** `/sitemap.xml`: `pages` aller Sprachen + sichtbare `urls`, gruppiert pro Eintrag mit `xhtml:link hreflang` (Union der Sprachen in `locales`). Einträge mit `updatedAt` bekommen `<lastmod>` (die späteste Zeit über die Sprachen), statische Seiten keins. Die Basis ist `url`. ISR wie Seiten.
- **Statische Seite:** Hat eine Seite nur `source: 'files'`-Bausteine, erzeugt `nuxt generate` ohne Server die ganze Seite (Prerender aller Seiten, `.md`, Sitemap, robots.txt, llms.txt, Suche); robots.txt ist dabei indexierbar, da die Ausgabe für den Produktionshost gedacht ist.
- **SEO:** `useGinkoSeo({ title, description, image, type, noindex, jsonLd })` setzt Titel, Meta, Open Graph, Twitter-Card, `robots` und JSON-LD in einem Aufruf. Standardwerte kommen aus `seo` in `ginko.config.ts` (`titleTemplate`, `description`, `image`, `organization`; nicht Teil des Schemas). Ein relativer Bildpfad wird mit `url` absolut. Auf der Startseite der Sprache kommen `WebSite` (und mit `seo.organization` `Organization`) dazu. Canonical, hreflang und `og:locale` bleiben bei ginko-i18n. Für `Article` nimmt `articleLd({ …, modified: item.updatedAt })` das Änderungsdatum als `dateModified` (ohne `updatedAt` entfällt das Feld).
- **KI-Agenten:** `/llms.txt` (Einträge der Hauptsprache mit Links auf `.md`), `/llms-full.txt` (deren Markdown in einer Datei, je mit `Source:`-Zeile), `<seite>.md` für jeden Eintrag mit Route, `Accept: text/markdown` auf der normalen URL und `Link: <seite.md>; rel="alternate"` auf jeder Eintragsseite; bei Plattformfehler 503 für `/llms.txt` und `.md`, Seiten bleiben unberührt. Aus mit `agents.enabled: false`; eigene `public/llms.txt` hat Vorrang.
- **robots.txt:** `/robots.txt` erlaubt alles und nennt `<url>/sitemap.xml`. Ein Host, der nicht der Host von `url` ist (Vorschau, Staging, localhost), bekommt `Disallow: /` und auf jeder Antwort `X-Robots-Tag: noindex`. Eine eigene `public/robots.txt` hat Vorrang. `<lastmod>` in der Sitemap fehlt: das Bundle hat kein Änderungsdatum.

## 9. CLI

| Befehl | Tut |
|---|---|
| `ginko dev` | lokal: Convex-Backend + Plattform (aus dem Monorepo, `GINKO_LOCAL=1`) + Seite; `devPush` bei jeder Config-Änderung |
| `ginko pull` | production → lokal: `export` in einen temporären Ordner, dann `import`, dann wird der Ordner gelöscht (Key-Scope `pull` oder `export`; nur lokal) |
| `ginko check` | 5.3 |
| `ginko release` | 5.1 |
| `ginko export [--out <ordner>]` | Schema + Einträge + Dateien in einen **Ordner** (Key-Scope `export` oder `pull`). Kein ZIP: `upload-artifact` von GitHub zippt den Ordner. Standard: `ginko-export-<seite>-<jjjj-mm-tt>`; der Ordner muss neu oder leer sein. Ausgabe: eine JSON-Zeile `{"export":"<ordner>","entries":N,"files":M}` |
| `ginko import <ordner>` | Export in die **lokale** Plattform laden (nur lokal, wie `dev`: sonst Abbruch, bevor etwas geschrieben wird). Ersetzt dort Einträge, Adressen, Datei-Verweise, `changes` und `ops` der Seite; Personen bleiben |

- **`GET /export?site=<slug>`** (Key-Scope `export` oder `pull`; Schlüssel, Seite und Fehler wie bei `GET /release/state`) liefert `{ format: 1, site, name, schema, schemaRev, contentRev, exportedAt, entries: [{ id, brick, kind, order, data, prints, rev, deletedAt? }], folders: [{ id, name, parent? }], files: [{ id, name, mime, size, width?, height?, folder?, kept?, focus?, sha256?, url }] }`.
  - `entries`: alle Einträge der Seite, auch gelöschte.
  - `files`: jeder fertige Upload, auf den ein Eintrag verweist. `url` ist die signierte Speicher-Adresse der verarbeiteten Datei (bei Bildern die WebP-Kopie; `mime` nennt dann `image/webp`). Die URL ist nicht Teil der Sicherung.
- **Ordner:** `export.json` (die Antwort ohne `url`, dafür `path` je Datei) und `files/<id><ext>` (Endung aus `mime`: jpg, png, webp, avif, pdf; sonst keine). Die Dateien werden mit einfachem `fetch` ohne Schlüssel geladen; die Größe jeder Datei wird gegen `size` geprüft. `export.json` wird zuletzt geschrieben: ein Ordner mit `export.json` ist vollständig.
- **Import:** erst das Schema mit `devPush`, dann jede Datei in den lokalen Speicher, dann das Leeren der Seite, dann die Einträge in Stapeln (`convex run` nimmt seine Argumente auf der Kommandozeile, daher höchstens 100 000 Byte je Aufruf). Ordner und Bibliotheksfelder der Dateien (`folder`, `kept`, `focus`, `sha256`) kommen mit; ältere Exporte ohne sie lassen sich weiter importieren. Dateien ohne Eintrags-Verweis reisen in einem ersten Stapel ohne Einträge. Die Upload-IDs in den Daten werden durch die neuen ersetzt (Uploads: `status: ready`, `uploader: 'import'`), `deletedAt`, `rev` und Abdrücke bleiben, Adressen und Datei-Verweise werden neu aufgebaut, die Zähler (`entryCount` nur lebende, `bytes`, `orderRevs`) stimmen danach. Die Eintrags-IDs sind neu; `changes` und Personen sind nicht Teil der Sicherung.

## 10. Auth

- Better Auth über better-convex, **E-Mail-OTP** (`emailOTP`). Alle Mails gehen über den `email`-Hook.
- **Registrieren nur auf Einladung:** Ein neues Konto entsteht nur für eine Adresse aus `GINKO_ADMIN_EMAILS` oder mit offener Einladung (`beforeUserCreate`).
- **Admin-Bootstrap:** Convex-Env `GINKO_ADMIN_EMAILS` (kommagetrennt). Wer sich mit einer dieser Adressen anmeldet, wird beim ersten Login in `admins` eingetragen.
- **Einladung:**
  1. admin (für owner) oder owner (für staff) legt `invites` an: Token zufällig, gespeichert wird nur der Hash, gültig 7 Tage.
  2. Die Mail enthält einen Link `/invite/<token>`.
  3. Annehmen (eine Mutation) geht nur angemeldet und mit **derselben E-Mail**. Der Token-Hash muss existieren, `acceptedAt` leer und `expiresAt` in der Zukunft sein, sonst `NOT_FOUND`. In derselben Mutation wird `acceptedAt` gesetzt und `memberships` angelegt. Ist der Nutzer schon Mitglied, bleiben Rolle und Grants; die Einladung wird trotzdem verbraucht, Ergebnis `{ already: true }`.
  4. Ohne Link: `invites.mine` listet die offenen Einladungen zur Adresse der angemeldeten Person (ohne Beachtung der Groß-/Kleinschreibung); „Meine Seiten“ zeigt sie als Karte. `invites.acceptMine({ invite })` nimmt eine davon an, mit denselben Wirkungen wie Schritt 3. Eine fremde, benutzte oder unbekannte Einladung ist `NOT_FOUND` (ohne zu verraten, ob es sie gibt); eine abgelaufene `NOT_FOUND` mit eigener Meldung.
- **Mail-Versand:**
  - Ist `GINKO_MAIL=outbox` (lokal, Test), wird in `outbox` geschrieben. Tests lesen dort.
  - Gehostet: `GINKO_MAIL=resend` mit `RESEND_API_KEY` und `GINKO_MAIL_FROM` (freigegeben am 9.10. für die Demo). Die Mail geht nach dem Commit der Mutation über eine geplante Action an Resend; sie wird in keiner Tabelle gespeichert. Fehlt der Schlüssel oder der Absender, ist der Login **aus** (die Login-Seite zeigt „Anmeldung noch nicht eingerichtet“). Es gibt keine Seed-Codes und keine Hintertür.
  - Testkonten: Mail an eine `.test`-Adresse (reservierte Domain, kann nie Mail empfangen) landet auch gehostet im `outbox`. `pnpm outbox <e-mail>` zeigt die neueste Mail (Code oder Einladungslink): lokal ohne weiteres, gehostet mit `CONVEX_DEPLOY_KEY` der Demo. So lässt sich alles ohne Resend testen; nur echte Adressen brauchen Resend.
  - Ohne bestätigte Domain stellt Resend nur an die Adresse des Resend-Kontos zu (Absender `onboarding@resend.dev`). Für die Demo reicht das für den Admin; Einladungen an andere Adressen brauchen eine bestätigte Domain (DNS, nicht freigegeben).
- **Sprache der Mails:** Anmeldecode in der Sprache der Person (`userSettings.locale`, sonst Deutsch), Einladung in der Sprache der einladenden Person (die eingeladene hat noch keine Einstellung), Erinnerung und Sammelmail der Vorschläge in der Sprache der Empfängerin. `account.setLocale({ locale })` setzt sie (nur Sprachen mit Katalog). Baustein-Labels in Mails bleiben, wie gespeichert.
- **Wochen-Erinnerung:** `reminders.sweep` läuft stündlich (Cron, Minute 5). Je Seite wird nur gehandelt, wenn es in ihrer Zeitzone am Tag vor dem ersten Tag der Woche (Standard: Sonntag) zwischen 17:00 und 18:00 ist. Für jeden Baustein `single`, der laut Kern-Regel `staleOf` nicht aktuell ist (eine Bearbeiten-Aufgabe belegt ein Datumsfeld mit `@thisWeek`, und das Feld enthält nicht den ersten Tag der Arbeitswoche, am Tag vor Wochenbeginn also der kommenden), geht eine Mail an jedes Mitglied mit Rolle `owner` oder mit der Aufgabe in den Grants (Admins nicht), mit bestätigter Adresse und ohne ausgeschaltete Einstellung. Betreff „<Baustein-Label> für nächste Woche fehlt noch“; die Mail nennt die Seite, den Link `SITE_URL/s/<site>` und wo man die Erinnerung ausschaltet. Je Seite, Baustein, Woche und Person genau eine Mail: `reminders` hält sie fest, ein zweiter Lauf sendet nichts. Die Einstellung „Erinnerungen per E-Mail“ (`account.setRemindByMail`, Standard an) steht in „Meine Seiten“. `sweep` nimmt optional `now` (Tests, Prüfung).
- **Push-Schlüssel:** `ginko_<site>_<32 Zeichen>`. Gespeichert wird nur SHA-256, mit Scopes.

## 11. Fehlercodes

`UNAUTHORIZED` (nur HTTP: Push-Schlüssel fehlt oder ungültig), `FORBIDDEN, NOT_FOUND, CHANGED_SINCE, OP_REUSED, INVALID (errors), TOO_LARGE, SLUG_TAKEN, NOT_UNDOABLE, SCHEMA_REJECTED (rejected), MIGRATION_CHANGED, MIGRATION_INCOMPLETE, RELEASE_TOO_LARGE, SITE_NOT_FOUND, FORMAT_UNSUPPORTED, STALE, RATE_LIMITED, UPLOAD_REJECTED`. Jeder Fehler hat `code`, `key` (Schlüssel im Katalog), `params` und `message`: der Schlüssel, schon übersetzt in die Sprache der anfragenden Person (`userSettings.locale`, sonst Deutsch). Die Kataloge liegen in `packages/ginko-server/i18n/<sprache>.json` (Deutsch ist die Quelle und der Fallback; eine neue Sprache ist eine neue Datei). Meldungen des Kerns (`validate`, `fileProblem`) tragen ihren eigenen `key` und `params` (Kataloge in `packages/ginko/i18n`).

## 12. Aufbewahrung und Sicherung

- `ops` 30 Tage, `changes` 1 Jahr.
- Einträge einer Sammlung mit `autoRemoveExpired`, die seit 30 Tagen nicht sichtbar sind, löscht der Cron (wie `remove`, Akteur `system`).
- Gelöschte Einträge 30 Tage, danach endgültig. Slug, `fileRefs` und Abdrücke fallen dann weg.
- Uploads ohne Verweis: 7 Tage (siehe 3); nicht betroffen sind `kept`, Dateien in einem Ordner und Dateien im Papierkorb.
- Papierkorb der Bibliothek: 30 Tage, danach löscht der Cron Datei und Zeile endgültig, aber nur wenn gar kein `fileRefs`-Verweis mehr besteht (auch keiner aus `changes`). Bei Verweisen bleibt die Datei im Papierkorb und wird am nächsten Tag wieder geprüft.
- Dateien vor einem Ersetzen (`previous`): 30 Tage, dann löscht der Cron ihren Speicher.
- Ein täglicher Cron arbeitet in Stapeln zu 200.
- **Sicherung:** wöchentlich ein `ginko export` in CI (Key-Scope `export`). Die Antwort von `GET /export` enthält auch `folders` und, je Datei, `folder`, `kept`, `focus`, `sha256`; Bibliotheksdateien ohne Verweis (`kept` oder in einem Ordner) gehören dazu, Papierkorb und frühere Versionen nicht. Der Import (`seed.importExport`) liest diese Felder, wenn sie da sind. Der Export ist ein Ordner; `upload-artifact` zippt ihn zum GitHub-Actions-Artefakt (90 Tage). Dazu gibt es einen **Wiederherstellungs-Test** in CI: Den Export in eine lokale Plattform importieren (`ginko import`, nur lokal) und das Bundle vergleichen.

## 13. Restaurant-Schema (Abnahme-Ziel v1)

Opus schreibt in Phase 4 die ausführbare `sites/restaurant/ginko.config.ts` mit wörtlichen Defaults, Beispiel-Daten (`contracts/restaurant/data.json`) und allen Aufgaben-IDs. Inhalt:
- `hours` (Einzelstück):
  - `week`: Liste mit 7 Zeilen, Tag Mo–So, je bis zu 2 Zeitfenster `from1/to1/from2/to2`, `closed`. Prüfung: `min: 7, max: 7, unique: 'day'`, `day` = Pflicht-choice mit den 7 Tagen.
  - `exceptions`: Liste mit daterange, Grund, `closed` (Std. true) und optionalen Zeiten `from1/to1/from2/to2` (nicht geschlossen + Zeiten = eigene Zeiten, z. B. 24.12. 11–14 Uhr).
  - `holidays` (choice `sunday` | `closed` | `normal`, Std. `sunday`): Feiertage, berechnet im Preset. Der Kalender ist Code-Einstellung (`hours({ holidays: 'AT' | 'DE' | 'SG' | 'none' | Funktion })`, Std. AT; `ctx.calendar` in `hoursOn`), kein Schemafeld. Alle Fabriken: `lang: 'de' | 'en'` für Editor-Texte; `menu`/`lunch`/`lunchPlans`: `allergens: 'EU' | 'none' | Liste`.
  - Baustein `hourPlans` (Sammlung, max 12): `label`, `from`, `to` (optional), `yearly` (Saison), `week` wie `hours.week`. Regel `hoursOn(date)`: heute geschlossen > Ausnahme > Feiertag > Zeitraum (späterer Beginn gewinnt) > Standard-Woche.
  - `closedOn` (date), `closedNote` (text).
  - `holidayNoticeDays` (number, Std. 14): So viele Tage vor einer Ausnahme zeigt die Seite einen Hinweis.
  - Aufgaben `closedToday`, `holiday` (edit `exceptions`).
  - JSON-LD: `restaurantJsonLd({ name, url, today, hours, address?, telephone?, email?, servesCuisine?, menu? })` im Preset baut schema.org `Restaurant`: `openingHoursSpecification` aus der Woche, die heute gilt (`weekFor`), und `specialOpeningHoursSpecification` für die nächsten 60 Tage aus `hoursOn` an Tagen, die von der Wochenregel abweichen (Schließung = `00:00`–`00:00`, andere Zeiten als eigene Spannen; aufeinanderfolgende gleiche Tage ein Eintrag). `servesCuisine` und `hasMenu` nur mit Daten. Die Startseite reicht das Objekt über `useGinkoSeo({ jsonLd })`.
- `notices` (Sammlung, max 5, `visible: active(until)`, `autoRemoveExpired: true`): Text (max 140), `until` (date, optional). Aufgaben `add` (create), `soldOut` (create, prefill Text „Heute sind wir ausgebucht.“ und `until: @today`), `remove`.
- `lunch` (Einzelstück): `weekOf` (date), `days` (Liste `min: 5, max: 5, unique: 'day'`, `day` = Pflicht-choice Mo–Fr; dazu Gericht, Preis money, Allergene choices), `note`. Aufgabe `lunchWeek` (edit `weekOf`, `days`, `note`; prefill `weekOf: @thisWeek`; die gespeicherten Gerichte sind die Vorlage).
- `lunchPlans` (Sammlung, max 3, order `weekOf asc`; Baustein zuletzt, damit `pos` stabil bleibt; Listen dürfen nicht verschachtelt werden, darum eigene Einträge statt Liste an `lunch`): `weekOf` (date, erster Tag der Woche), `days` wie `lunch.days`, `note`. Aufgaben `planNext` (create, prefill `weekOf: @nextWeek`, „Nächste Woche planen“), `edit` (pick), `remove`. `lunchWeekOn(lunch, plans, today, week)` im Preset: die geplante Woche, deren erster Tag die Arbeitswoche ist, gewinnt, sonst die Hauptfelder, wenn sie diese Woche sind, sonst nichts. Vergangene Wochen fallen in der Anzeige weg; Entfernen von Hand (Vorbelegung aus der letzten Woche gibt es noch nicht).
- `menu` (Sammlung, max 150, order manual): `category` (choice: Vorspeisen, Suppen, Hauptspeisen, Desserts, Getränke), `name`, `description`, `price` (money), `allergens` (choices A Gluten, B Krebstiere, C Ei, D Fisch, E Erdnuss, F Soja, G Milch, H Schalenfrüchte, L Sellerie, M Senf, N Sesam, O Sulfite, P Lupinen, R Weichtiere; Pflicht, `[]` = keine), `veg` (choice: keins, vegetarisch, vegan), `nextPrice` (money, optional) und `priceFrom` (date, optional): `priceOn(item, date)` im Preset liefert `nextPrice` ab `priceFrom` (einschließlich), sonst `price`; die Seite zeigt „ab <Datum> <Preis>“, wenn die Änderung in höchstens 14 Tagen beginnt (`upcomingPrice`). Aufgaben `edit` (pick, die ersten sechs Felder), `price` (pick, nur price), `priceFrom` („Preis ab …“, pick, `nextPrice` + `priceFrom`), `add`, `remove`.
- `events` (Sammlung, max 30, order `when asc`, `visible: upcoming(when)`, route `{ de: '/veranstaltungen/[slug]', en: '/en/events/[slug]' }`): `title`, `slug`, `when` (daterange), `start` (time, optional, Beginn am ersten Tag), `description` (markdown, Profil `basic`), `price` (money, optional), `booking` (text url, optional), `image` (optional). Aufgabe `add`, `remove`.
- `gallery` (Einzelstück): `images` (Liste max 24 von image). Aufgabe `edit`.
- `legal` (Einzelstück): `imprint`, `privacy` (markdown `basic`, `translate: 'manual'`).
- `seo` (Einzelstück): `title`, `description` (text, übersetzbar), `image` (optional). SEO pro Event: über `title`/`description` des Events. PDF-Speisekarte: nicht in v1.
- Sprachen `['de', 'en']`, Währung EUR, Zeitzone Europe/Vienna.
- Rollen: Wirtin = owner. Koch = staff mit `menu.edit`, `menu.price`, `menu.add`, `menu.remove`, `lunch.lunchWeek`.

## 14. Abnahme v1 (Restaurant)

`tests/acceptance.md` ordnet jede ID einem Test zu (oder einer Begründung, warum entfallen).
- **Schema/Release:**
  - S1–S6, S9–S11, S13, S15 aus der Zwischenreview vom 8.10. S7 neu: Ein zurückgezogener Baustein bleibt im Bundle und ist im Editor weg.
  - stale build
  - neuer Eintrag während des Releases
  - Migration mit gleicher ID, anderem Abdruck
  - leere Writes für neue Migration (`MIGRATION_INCOMPLETE`)
  - Release-Wiederholung mit gleichem Commit (gleiche Antwort)
  - Release mit Migration und neuem Pflichtfeld mit Default zugleich
  - Rollback-Test: alter Code + Bundle mit zurückgezogenem Feld, auch für einen neuen Eintrag
- **Schreiben:**
  - B1–B4, B6–B8, B11
  - opId mit anderem Inhalt; Wiederholung nach verlorener Antwort
  - staff außerhalb der Aufgabe
  - Zugriffe über Seitengrenzen für jede Operation und jede ID-Art, auch Upload
  - undo von remove/restore/reorder abgelehnt
  - zwei gleichzeitige reorder
  - Übersetzung: ganzer Wert gespeichert, unveränderte Fremdsprache bleibt veraltet; `confirm` macht frisch
  - `autoRemoveExpired`
- **Auslieferung:**
  - A1–A3, A6, A7, A9
  - 503 statt 404 bei Plattformfehler
  - unbekannte Sprache
  - `javascript:`-Link
  - Markdown über den Grenzen (Profil, Länge, 20000 Knoten)
  - veraltete Übersetzung → Hauptsprache
  - urgentRefresh inkl. gelöschter Detailseite und `STALE`-Wiederholung
  - Vorschau einer unveröffentlichten Route ohne Production-Abruf
- **Dateien:** Upload fremder Seite unmöglich; Absturz nach der Verarbeitung → Wiederholung klappt; EXIF entfernt.
- **Sicherheit/Betrieb:** O1–O3, O5 (Export mit Dateien), O7 (Wiederherstellungs-Test).
- **Demo:** jede Restaurant-Aufgabe aus DEMOS.md als Playwright-Test bei 390 px und 1440 px, Walkthrough als Wirtin und als Koch (Haiku im Browser).
- **Korpus:** Industrie- und SaaS-Schema (SaaS mit zwei money-Feldern EUR und CHF) bestehen `serializeSchema`, `validate`, `diffSchema` und `buildBundle` gegen die erwarteten Bundles.

## 15. Entwürfe (Plan v5, Phase 22)

**Wer, wofür:** Marketing schreibt einen Blog-Artikel (2× im Monat, Laptop, über mehrere Sitzungen), Entwicklung den Changelog (wöchentlich), Industrie News. **Muss stimmen:** ein Entwurf steht nie im öffentlichen Bundle; nichts geht überraschend online; der Status ist ehrlich („Entwurf“, „Online ab 14. Okt., 9:00“, „Online“).

- **Schema:** Sammlungen bekommen `drafts?: boolean` (Standard `false`). Einzelstücke haben keine Entwürfe: dort bleibt Speichern = live mit Rückgängig. `drafts` ist Darstellung und Ablauf, kein Datenvertrag: `diffSchema` erlaubt An- und Abschalten (Abschalten veröffentlicht nichts; vorhandene Entwürfe bleiben Entwürfe, bis jemand sie veröffentlicht oder löscht).
- **Daten:** `entries` bekommt `state?: 'draft' | 'live'` (fehlt = `live`, keine Migration nötig) und `publishAt?: number` (ms, nur bei `draft`), dazu `publishJob?: Id<'_scheduled_functions'>`.
- **Bundle (6):** Einträge mit `state: 'draft'` fehlen im Bundle, in `urls`, Sitemap und Suche. Ihr Slug ist trotzdem reserviert, damit die Adresse beim Veröffentlichen feststeht.
- **Revisionen:** Änderungen an einem Entwurf erhöhen `entry.rev` und `fieldRevs`, aber nicht `site.contentRev` (das Bundle ändert sich nicht, kein Neuladen). Veröffentlichen und Zurückziehen erhöhen `contentRev`.
- **Bearbeiten eines veröffentlichten Eintrags** ist sofort live (wie heute, mit Rückgängig). Es gibt keine Entwurfs-Kopie eines Live-Eintrags; wer länger umbauen will, zieht ihn zurück. Grund: eine Wahrheit pro Eintrag statt zweier Fassungen.
- **Operationen** (Ablauf 4.1, Rechte: jede Aufgabe `create` oder `edit` des Bausteins genügt):

| Operation | Argumente | Vorbedingung | Wirkung | Rückgängig |
|---|---|---|---|---|
| `entries.create` | wie 4.2, dazu `publish?: { at?: number }` | wie 4.2 | Bei `drafts: true` ohne `publish` entsteht ein Entwurf | über `remove` |
| `entries.publish` | `entry, lifeRev, at?: number` | Entwurf, nicht gelöscht, `lifeRev` gleich; `at` (falls da) in der Zukunft und ≤ 1 Jahr | ohne `at`: `state: 'live'`, `contentRev+1`; mit `at`: `publishAt`, `scheduler.runAt(at, internal.entries.publishDue, { entry, at })` (alter Job wird abgebrochen); `lifeRev+1`; `changes` `kind: 'publish'` bzw. `'schedule'` | über `unpublish` |
| `entries.unpublish` | `entry, lifeRev` | live oder geplant | `state: 'draft'`, `publishAt` und Job weg, `lifeRev+1`, `contentRev+1` wenn er live war; `changes` `kind: 'unpublish'` | über `publish` |
| `internal.entries.publishDue` | `entry, at` | Eintrag ist noch Entwurf mit genau diesem `publishAt` (sonst nichts tun) | wie `publish` ohne `at`, Akteur `system`; danach Neuladen wie bei jedem Speichern | — |

- **Oberfläche:** Im Formular eines `drafts`-Bausteins: Hauptknopf „Entwurf speichern“, daneben „Veröffentlichen …“ (Menü: „Jetzt“, „Online ab …“ mit Datum und Uhrzeit in der Zeitzone der Seite). Status-Chip in Listen: „Entwurf“, „Online ab 14. Okt., 9:00“, „Online“. Meldung nach „Jetzt“: „Veröffentlicht. Auf der Website in etwa einer Minute.“ [Rückgängig]. Die Vorschau (8) zeigt den Entwurf, denn ihr Bundle baut die Plattform aus dem Formular.
- **Tests:** Entwurf fehlt im Bundle und in der Sitemap; geplanter Entwurf erscheint nach `publishAt` (Convex-Test mit Uhr); ein umgeplanter Job veröffentlicht nicht zum alten Zeitpunkt; Bearbeiten eines Entwurfs erhöht `contentRev` nicht; Slug eines Entwurfs ist reserviert.

## 16. Agenten-Tür: MCP (Plan v5, Phase 22)

**Wer, wofür:** Die Wirtin oder Gründerin sagt ihrem eigenen Assistenten (Claude, ChatGPT, Cursor): „Setz Heute ausgebucht“, „Trag das Mittagsmenü vom Foto ein“, „Mach das rückgängig“. **Muss stimmen:** der Agent kann genau das, was die Person über ihre Aufgaben darf, nicht mehr; jede Änderung steht im Verlauf als „über KI“ mit der Person; Rückgängig geht wie sonst. Ginko braucht dafür **keinen eigenen KI-Anbieter**: der Assistent der Person ruft die Werkzeuge.

- **Transport:** MCP Streamable HTTP, `POST <convex-site>/mcp` (Convex HTTP Action), JSON-RPC 2.0, zustandslos (Antworten als `application/json`, kein SSE, keine Sitzung). Methoden: `initialize`, `tools/list`, `tools/call`, `ping`. Protokollversion `2025-06-18`.
- **Anmeldung:** `Authorization: Bearer <Agenten-Schlüssel>`. Tabelle `agentKeys`: `site, user, hash, label, createdAt, lastUsedAt?, revokedAt?` (by_hash, by_site_user). Eine Person legt ihn in der Plattform an („Mit KI verbinden“, Seite `/s/[site]/ki`): die Plattform zeigt URL und Schlüssel **einmal** und eine fertige Zeile für Claude Code (`claude mcp add --transport http ginko <url> --header "Authorization: Bearer …"`). Widerrufen jederzeit. Der Schlüssel erbt Rolle und Grants der Person zum Zeitpunkt des Aufrufs; Mitgliedschaft weg → 401. OAuth 2.1 für ChatGPT-Connectoren folgt später (Risiko 12).
- **Werkzeuge** (aus dem Schema erzeugt, nur die der Person erlaubten):
  - `ginko_overview` — Seite, Sprachen, Bausteine mit Bezeichnung und die erlaubten Aufgaben.
  - `ginko_read({ brick, locale? })` — Inhalt in Bundle-Form (6), Sammlungen mit Eintrags-IDs.
  - eine Aufgabe = ein Werkzeug `task_<brick>_<id>`; Beschreibung = Aufgaben-Bezeichnung + Feldbezeichnungen; `inputSchema` aus den Feldern der Aufgabe über `taskInputSchema(brick, task)` aus `@lupinum/ginko` (JSON Schema; Feldtypen wie in 2.2, übersetzbare Felder als Text in der Hauptsprache, `prefill` aufgelöst als `default`). `edit` mit `pick` und `remove` haben zusätzlich `entry`; `remove` verlangt `confirm: true`.
  - `ginko_history({ limit? })` — die letzten Änderungen (`changes.list`) mit ID und Satz.
  - `ginko_undo({ change })` — wie die Rückgängig-Taste (4.2).
  - Weitere Werkzeuge, jeweils nur in `tools/list`, wenn die Person sie nutzen darf (Beschreibungen, Antworten und Fehlertexte auf Englisch, der Sprache des Modells, nicht der Inhalte; Anleitung für den Assistenten: `packages/ginko-server/SKILL.md`):
    - `ginko_search({ query, brick?, limit? })` — Einträge (auch Entwürfe) nach Wörtern in allen Texten, ohne Beachtung von Groß- und Kleinschreibung und Umlauten (Suchmaschine aus `@lupinum/ginko/search`); Treffer mit `entry`, `brick`, `label`, `snippet`.
    - `propose: true` an jedem schreibenden Werkzeug (Aufgaben, `ginko_translate`, `ginko_revert`): „zeig mir zuerst“. Der Aufruf wird ein Vorschlag (17), auch wo die Person direkt schreiben dürfte; Umsetzung als Akteur-Merkmal `forceProposal` in `needsProposal`, Anwenden läuft über denselben Weg.
    - `ginko_draft({ brick, fields })` — nur für Sammlungen mit `drafts: true` und mit einer `create`-Aufgabe der Person (owner/admin: immer); legt einen Entwurf an, nie live.
    - `ginko_translate({ entry, locale, fields, confirm? })` — nur mit `edit`-Recht (owner/admin immer, `staff` mit einer `edit`-Aufgabe, die die Felder abdeckt) und nur bei mehreren Sprachen: schreibt Texte übersetzbarer Felder in einer Fremdsprache über `entries.save` mit `locale`; die Hauptsprache wird abgelehnt. `ginko_read` in einer Fremdsprache nennt in `stale` die Texte mit veralteter Übersetzung.
    - `ginko_version_at({ entry, change })` und `ginko_revert({ entry, change })` — `entries.versionAt` und `entries.revert`; `ginko_revert` nur mit `edit`-Recht.
    - `ginko_file_usage({ file })` — wo eine Datei benutzt wird (`files.info.usedIn`: Eintrag, Baustein, Bezeichnung, Pfade, `missingAlt`).
    - `ginko_check_links({ brick? })` — kaputte interne und unsichere Links (`checkLinks` aus dem Kern über den aktuellen Inhalt aller Sprachen): Eintrag, Feld, Link, Grund.
    - `ginko_proposals({ status? })` — die eigenen Vorschläge der Person mit Stand und Grund.
    - `ginko_overview` meldet `review` und, wenn die Prüfung für den Schlüssel gilt, „Änderungen über diesen Schlüssel warten auf Freigabe.“
- **Ausführen:** Jeder Aufruf läuft durch dieselben Mutationen und denselben Ablauf (4.1) wie die Oberfläche: `opId` = neu pro Aufruf (JSON-RPC-`id`s beginnen mit jeder Client-Sitzung neu bei 0; ein Hash daraus würde einen späteren gleichen Aufruf als Wiederholung behandeln und nichts tun), Akteur = die Person, `changes.via: 'agent'`, `changes.agentKey`. Fehler kommen als Werkzeug-Ergebnis mit `isError: true` und dem deutschen Text aus 11, damit der Assistent ihn der Person sagen kann.
- **Grenzen:** 60 Aufrufe pro Minute und Schlüssel (`RATE_LIMITED`); Antworten ≤ 256 KiB; keine Datei-Uploads in v1 (Bildfelder nehmen nur vorhandene `FileId`s).
- **Verlauf und Oberfläche:** `changes` mit `via: 'agent'` zeigen „über KI (Claude Code)“ (Schlüssel-Bezeichnung) neben der Person.
- **Fertig, wenn:** Claude Code mit dem Schlüssel einer Test-Wirtin lokal „Heute ausgebucht“ setzt, der Hinweis in der Vorschau erscheint, `ginko_undo` ihn entfernt; ein Koch-Schlüssel sieht nur die Speisekarten- und Mittagsmenü-Werkzeuge; ein widerrufener Schlüssel bekommt 401.

## 17. Freigaben (Plan v5, Schritt F2)

**Wer, wofür:** Die Wirtin lässt Aushilfen oder ihren KI-Assistenten Änderungen vorschlagen, die erst nach ihrem Ja live gehen. **Muss stimmen:** ohne Schalter ändert sich für niemanden etwas; ein Vorschlag schreibt nichts, bis er angewendet wird; angewendet wird über denselben Weg wie jede Änderung (4.1), mit dem Genehmiger im Verlauf.

- **Schalter (Standard aus):**
  - `needsApproval: true` an einer Aufgabe (2.7): Was `staff` mit dieser Aufgabe an **Live-Inhalt** ändert, wird ein Vorschlag. Entwürfe bearbeiten, löschen oder anlegen ist nie freigabepflichtig (nicht live); `entries.publish` und `entries.unpublish` immer, sobald `staff` eine `create`- oder `edit`-Aufgabe des Bausteins mit dem Schalter hat. Rückgängig und Wiederherstellen sind für diese Aufgaben gesperrt (`FORBIDDEN`): man schlägt neu vor.
  - Agent: Ein Aufruf über einen Agenten-Schlüssel (16) wird ein Vorschlag, wenn `review` gilt. Vorrang: `agentKeys.review` → Website-Einstellung `sites.agentReview` → `agents: { review }` in `ginko.config` (Teil des Schemas) → aus. Eigenen Schlüssel einschalten dürfen Person und Inhaber; **ausschalten oder zurücksetzen nur owner und admin** (sonst höbe Personal die Prüfung der Seite auf). Website-Einstellung: nur owner und admin.
  - Owner und admin über die Oberfläche: immer direkt.
- **Wann:** `needsProposal(actor, op, task, entry)` in `lib/policy.ts`, nach allen Prüfungen des Ablaufs 4.1 (Rechte, Vorbedingung, `validate`, Dateien, Budget). Ein ungültiger Vorschlag wird sofort abgelehnt, nicht erst bei der Freigabe.
- **Antwort einer Schreiboperation, die ein Vorschlag wurde:** `{ proposal: Id, status: 'open' }` statt des normalen Ergebnisses. Es wird nichts geschrieben (kein `rev`, kein `contentRev`, keine `changes`-Zeile). Wiederholung mit gleicher `opId` gibt dasselbe Ergebnis. Der Agent bekommt den Text „Vorgeschlagen, wartet auf Freigabe.“
- **Tabelle `proposals`:** `site, op ('save'|'create'|'remove'|'publish'|'unpublish'), brick, entry?, args (Argumente der Operation mit `opId`), base (Revisionen beim Vorschlag), before/after (geänderte Felder, für den Diff), sentence, author, via ('ui'|'agent'), agentKey?, status ('open'|'scheduled'|'applied'|'rejected'|'stale'|'withdrawn'; `approved` ist reserviert), at?, release?, decidedBy?, decidedAt?, reason?, change?, mailedAt?`. Höchstens 200 offene je Seite, höchstens 900 KiB je Vorschlag.
- **Anwenden:** dieselbe Operation (`saveAs`, `createAs`, …) im Namen des Autors, mit dem Genehmiger als `changes.approvedBy` (`actor` bleibt der Autor, auch `via 'agent'` und `agentKey`). Rechte und Vorbedingungen werden **jetzt** geprüft. Schlägt eine fehl (Feld inzwischen geändert, Eintrag gelöscht, Autor nicht mehr Mitglied …), wird der Vorschlag `stale` mit deutschem Grund; nichts wird geschrieben. Die `changes`-Zeile ist wie bei `save` rückgängig zu machen.
- **Entscheiden** (`convex/proposals.ts`): `approve` und `reject` nur owner und admin (`staff` → `FORBIDDEN`); **nie den eigenen Vorschlag**, ausgenommen den eines eigenen Agenten („zeig mir zuerst“). `approve({ proposal, at? })`: mit `at` (Zukunft, ≤ 1 Jahr) wird die Anwendung geplant (Status `scheduled`) und zur Laufzeit neu geprüft; war inzwischen etwas anders, wird der Vorschlag `stale`. `reject({ proposal, reason })`: Grund in einem Satz, 1 bis 300 Zeichen. `withdraw({ proposal })`: nur der Autor, nur solange `open`.
- **Releases:** `releases { site, name, at?, status ('open'|'scheduled'|'applied'|'stale'), createdBy, … }`. `createRelease`, `addToRelease`, `removeFromRelease`, `approveRelease({ release, at? })` nur owner und admin; höchstens 50 Vorschläge. Ein Mitglied wird nur mit dem Release entschieden. `approveRelease` prüft zuerst alle (auch Zusammenstöße untereinander, z. B. zweimal dasselbe Feld): passt einer nicht mehr, wird er `stale`, der Release `stale`, nichts wird geschrieben und die Antwort nennt die Vorschläge (`stale: [{ proposal, sentence, reason }]`). Erst nach `removeFromRelease` der veralteten Mitglieder geht er durch. Sonst werden alle in **einer** Mutation angewendet, in Reihenfolge des Vorschlags; schlägt dabei doch einer fehl, wird alles zurückgerollt (`STALE`). `at` (Argument, sonst das geplante `at` des Releases, falls noch in der Zukunft) plant ihn.
- **Lesen:** `list({ site, status?, cursor })` (Genehmiger alle, Autoren die eigenen, 50 je Seite), `count({ site })` für „Zu prüfen (n)“, `get({ site, proposal })` mit `diff: [{ field, label, before, after }]` und `conflict` (Grund, falls er jetzt veraltet wäre), `releases({ site })`.
- **Mail:** Der erste offene Vorschlag einer Seite plant eine Sammelmail an die owner der Seite 10 Minuten später; Vorschläge in dieser Zeit stehen in derselben Mail (Autor und Satz je Vorschlag, dazu der Pfad `/s/<site>/pruefen`). Ist bis dahin nichts mehr offen, geht keine Mail.
- **Aufbewahrung:** entschiedene Vorschläge und Releases werden nach 1 Jahr gelöscht (wie `changes`, 12).
- **Tests:** `packages/ginko-server/test/proposals.test.ts`.
