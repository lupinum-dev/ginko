# Ginko-Plattform: UI-Spec v1 (Phase 8, 8. Oktober 2026)

Für die Plattform-Oberfläche `packages/ginko-studio/app` (Nuxt-Layer mit better-convex-nuxt, Host: `apps/platform`). Gilt zusammen mit SPEC.md (Daten, Operationen, Fehlercodes) und DEMOS.md (Restaurant). Ziel-Demo: Gasthaus zur Linde. Alles hier ist **schema-getrieben**: Kein Bildschirm kennt „Mittagsmenü“ oder „Allergene“; er kennt Bausteine, Aufgaben und Feldtypen.

## 1. Jobs

| Wer | Job | Häufigkeit | Situation | Muss stimmen | Ziel |
|---|---|---|---|---|---|
| Wirtin | „Heute ausgebucht“ | wöchentlich | Handy, zwischen den Services | läuft heute Nacht von selbst ab; ehrlich: auf der Seite nach ~1 Minute | 2 Taps ab Start, ohne Tippen |
| Wirtin | „Heute geschlossen“ (mit Grund) | selten | Handy | „heute“ = Datum in Wien; endet von selbst | 2 Taps + optional Grund |
| Wirtin | Mittagsmenü der Woche | **wöchentlich, Montag früh** | Handy oder Laptop | 5 Tage Gericht, Preis, Allergene; Vorlage = letzte Woche; „Woche ab“ = dieser Montag | < 3 Minuten, keine Hilfe |
| Koch | Preis eines Gerichts ändern | monatlich | Handy in der Küche | Gericht per Suche finden, nur der Preis; Konflikt mit der Wirtin sichtbar | Suche + 1 Eingabe |
| Koch | Gericht bearbeiten, hinzufügen, entfernen | monatlich | Laptop | **Allergene Pflicht**, „keine“ ist eine bewusste Angabe | ohne Hilfe |
| Wirtin | Hinweis vorzeitig entfernen | selten | Handy | Rückgängig möglich | 2 Taps |
| Wirtin | Betriebsurlaub eintragen | 2× im Jahr | Laptop | Zeitraum, Grund; Seite warnt vorher | ohne Hilfe |
| Wirtin | Veranstaltung anlegen | monatlich | Laptop | Datum, Preis, Reservierungs-Link, Bild mit Alt-Text | ohne Hilfe |
| Wirtin | Fotos der Galerie | selten | Handy | Foto direkt vom Handy; Alt-Text Pflicht; GPS weg (Server) | ohne Hilfe |
| Wirtin | Fehler rückgängig machen | nach Fehler | überall | dort, wo die Änderung passiert ist (Meldung), und im Verlauf | 1 Tap |
| Wirtin | Mitarbeiter einladen, Rechte setzen | selten | Laptop | geringste Rechte als Standard | ohne Hilfe |
| Alle | Anmelden | neues Gerät | Handy | Code per Mail, kein Passwort | < 1 Minute |
| Neue Person | Einladung annehmen | einmal | Handy | gleiche E-Mail wie eingeladen | ohne Hilfe |
| Lupinum | Inhalt in Englisch prüfen/übersetzen | selten | Laptop | veraltete Übersetzung ist sichtbar | — |

Belege: DEMOS.md (Restaurant), owner-editing-Muster (Wochenplan, Ausnahmen statt Umschalter, Rückgängig, ehrlicher Status). Annahmen ohne Beleg: Wirtin macht den Mittagsplan am Handy; Koch sucht Gerichte per Name. Prüfen im Walkthrough und bei der ersten echten Kundin.

## 2. Aufbau

Routen:
- `/login` — E-Mail, dann 6-stelliger Code.
- `/invite/[token]` — Einladung annehmen (anmelden, falls nötig, dann annehmen).
- `/` — meine Seiten. Bei genau einer Seite direkt weiter zu `/s/<slug>`.
- `/s/[site]` — **Schnell ändern** (Start, Handy zuerst).
- `/s/[site]/all` — **Alles bearbeiten**: Bausteine und Einträge, Formular mit Vorschau (Laptop zuerst).
- `/s/[site]/all/[brick]` und `/s/[site]/all/[brick]/[entry]`.
- `/s/[site]/history` — Änderungen mit Rückgängig.
- `/s/[site]/team` — Mitglieder und Einladungen (nur owner/admin).

Kopfzeile jeder Seite: Name der Seite, Link „Seite ansehen ↗“ (öffnet `site.url` in neuem Tab), Navigation „Schnell ändern · Alles bearbeiten · Verlauf · Team“ (Team nur owner/admin), Abmelden im Menü. Auf dem Handy: Name + Menü-Knopf; die vier Ziele als untere Leiste ist **nicht** nötig (Schnell ändern ist Start).

## 3. Schnell ändern (`/s/[site]`)

Eine Seite, von oben nach unten, je **Baustein mit Aufgaben, die der Nutzer darf** (staff: nur Grants), in Schema-Reihenfolge:

```
[Gasthaus zur Linde]                 [Seite ansehen ↗]
Öffnungszeiten
  Heute (Do 8. Okt): geöffnet          ← Zustand, aus den Daten
  [Heute geschlossen]  [Betriebsurlaub]
Hinweise
  • Heute sind wir ausgebucht. (bis heute)      [Entfernen]
  • Weinabend am 16. Oktober … (bis 16. Okt)    [Entfernen]
  [Heute ausgebucht]  [Hinweis hinzufügen]
Mittagsmenü
  Woche ab 5.10.2026  (sonst: „…, noch nicht für diese Woche“)
  [Mittagsmenü dieser Woche]
Speisekarte
  [Preis ändern] [Gericht bearbeiten] [Gericht hinzufügen] [Gericht entfernen]
…
```

Regeln:
- **Aufgaben-Knöpfe**: `edit` und `create` als Knöpfe mit dem Label der Aufgabe. Der erste Knopf eines Bausteins ist gefüllt, die anderen umrandet. Mindestens 48 px hoch.
- **`remove`-Aufgaben**: Zeitlich begrenzte Sammlungen (mit `visible`, z. B. Hinweise, Veranstaltungen) zeigen ihre Einträge mit „Entfernen“ an jeder Zeile (bis 10). Alle anderen (Speisekarte): Knopf → Auswahl (wie `pick`). Die Meldung nennt den Eintrag („„Topfenstrudel“ entfernt.“) und hat [Rückgängig]; in „Alles bearbeiten“ bleibt er 30 Tage unter „Entfernt“.
- **Doppelt**: Legt eine `create`-Aufgabe einen Eintrag an, den es sichtbar schon gibt (gleicher Titel), steht im Blatt „Diesen Eintrag gibt es schon: … Speichern legt einen zweiten an.“ (Hinweis, keine Sperre).
- **Zustand** je Baustein (eine Zeile, ehrlich, aus den Daten): Sammlung = sichtbare Einträge mit ihrem Titel (erstes Text-Feld) und ggf. „bis <Datum>“; abgelaufene/kommende gedimmt mit „ab …“/„abgelaufen“. Einzelstück = nichts, außer den Bausteinen mit eigener Zusammenfassung unten.
- Zusammenfassungen, die das Schema nicht kennt, gibt es nicht. Ausnahme, generisch: ein Einzelstück mit `date`-Feld, das per Aufgabe-Prefill `@today` gesetzt wird (z. B. `closedOn`), zeigt „Heute: <Aufgabe-Label>“, wenn dieses Datum heute ist. Dort steht „**Heute geschlossen** ist für heute eingetragen.“ mit den getippten Texten der Aufgabe (z. B. „Geschlossene Gesellschaft“) und **„Aufheben“** (setzt die optionalen Felder der Aufgabe auf `null`).
- **`pick`-Aufgaben** (`Preis ändern`): Tap → Auswahlblatt mit Suchfeld (filtert auf das erste Text-Feld, ohne Groß/Klein und Umlaute) und Liste gruppiert nach dem ersten `choice`-Feld (Kategorie). Tap auf Eintrag → Aufgabenblatt.

### 3.1 Aufgabenblatt

- Handy: Blatt von unten (natives `<dialog>`, `showModal`), bis 92 % hoch, scrollt innen. Desktop (≥ 900 px): Dialog rechts, 480 px breit.
- Kopf: Aufgaben-Label; bei `pick` darunter der Eintrag („Wiener Schnitzel vom Kalb“).
- Inhalt: **nur die Felder der Aufgabe** (`edit`: `fields`; `create`: alle nicht zurückgezogenen Felder außer `slug`). Startwerte aus `tasks.prefill({ site, task, entry })`; bei `create` zusätzlich die Defaults des Schemas.
- Fuß, immer sichtbar (sticky): „Speichern“ (gefüllt), „Abbrechen“. Speichern ist während des Speicherns gesperrt und zeigt „Speichert …“.
- Schließen mit ungespeicherten Änderungen fragt: „Änderungen verwerfen?“ [Verwerfen] [Weiter bearbeiten].
- Übersetzbare Felder werden in Schnell ändern **nur in der Hauptsprache** bearbeitet: `entries.save` mit `locale: <main>`; `entries.create` mit `{ [main]: wert }`.

### 3.2 Speichern, Status, Rückgängig

- Jeder Speicherversuch bekommt eine `opId` (UUID). Bei Verbindungsverlust sendet der Convex-Client **denselben** Aufruf von selbst erneut; der Server beantwortet eine bekannte opId mit dem gespeicherten Ergebnis. Nach 4 s zeigt der Knopf „Wartet auf Verbindung …“; das Blatt bleibt offen, die Eingaben bleiben.
- **Speichern gesperrt**, solange ein Feld etwas offen hat, mit einem ganzen Satz über dem Formular: ein Foto oder PDF wird noch verarbeitet („Das Foto wird noch verarbeitet. Bitte kurz warten.“), oder eine Listenzeile wartet auf „Noch richtig?“.
- `entries.save` sendet nur geänderte Wurzelfelder, `baseRev` = `rev` des Eintrags beim Öffnen.
- Erfolg: Blatt schließt, Meldung unten (Toast, 8 s, mit Fokus erreichbar): **„Gespeichert. Auf der Website in etwa einer Minute.“** [Rückgängig]. Rückgängig ruft `entries.undo` (bei save), `entries.remove` (bei create), `entries.restore` (bei remove). Danach „Rückgängig gemacht.“
- Die Meldung lügt nicht: kein „Live“-Häkchen, solange wir es nicht prüfen. (Urgent-Refresh kommt in „Alles bearbeiten“, Teil 4.)
- **Konflikt** (`CHANGED_SINCE`): Blatt bleibt offen mit den Eingaben. Oben: „Inzwischen hat jemand <Feld-Labels> geändert.“ Pro betroffenem Feld klein „Jetzt gespeichert: <Wert>“. Knöpfe: [Meine Eingaben speichern] (neuer `baseRev` aus `details.rev`, neue opId) und [Neuen Stand übernehmen] (Formular = Server-Stand).
- **Gelöscht** (`CHANGED_SINCE` mit `deleted`): „Dieser Eintrag wurde inzwischen entfernt.“ [Schließen].
- **INVALID**: Fehler je Feld aus `details.errors[].path` (Pfad mit Listen-`_id` → Zeile), Fokus auf das erste fehlerhafte Feld. Fehler ohne sichtbares Feld oben im Blatt.
- Andere Fehler: Meldung im Blatt mit der deutschen `message` des Servers.

## 4. Alles bearbeiten (`/s/[site]/all`)

- Links (Desktop) bzw. oben (Handy): Liste der Bausteine (Label). Zurückgezogene Bausteine fehlen.
- Einzelstück: direkt das Formular aller Felder.
- Sammlung: Liste der Einträge (inkl. abgelaufener, gedimmt mit „abgelaufen“/„ab …“), [Neu], bei `order: 'manual'` Reihenfolge per „nach oben/unten“-Knöpfen (`entries.reorder`, nur owner/admin; kein Drag als einzige Bedienung). Gelöschte Einträge (30 Tage) unter „Entfernt“ mit [Wiederherstellen].
- Formular: alle Felder, gleiche Feld-Komponenten wie Schnell ändern. Speichern wie 3.2.
- **Sprachen**: Umschalter oben „Deutsch · English“ bei mehrsprachigen Seiten. In der Fremdsprache: übersetzbare Felder zeigen den Text der Hauptsprache klein darüber; ist die Übersetzung veraltet (Abdruck ≠), steht „Deutsch geändert – Übersetzung prüfen“ und ein Knopf „Passt so“ (`confirm`). Speichern mit `locale`.
- **Listen** (z. B. Mittagsgerichte auf Englisch): jede übersetzbare Zelle zeigt denselben Stand wie ein Feld oben (Text der Hauptsprache darüber, „veraltet“ mit „Passt so“, „noch nicht übersetzt“). `confirm` nimmt den Pfad der Zelle (`days.<_id>.dish`). Nachgezogen in Phase 11.
- **Vorschau** (≥ 1200 px rechts, sonst Knopf „Vorschau“): iframe auf `<site.url>/__ginko/preview?path&locale&session`. Bundle = `buildBundle` aus dem Kern mit den gespeicherten Einträgen **plus** den ungespeicherten Formularwerten des offenen Eintrags. Pfad: Detailseite des Eintrags, wenn er eine Route hat, sonst die erste Seite aus `pages`. Nachrichten laut SPEC 8.
- „Sofort von der Seite nehmen“ (owner/admin, Menü): ruft `sites.urgentRefresh`, zeigt „Neu geladen: 12 Seiten“ oder die Fehler.

## 5. Feld-Komponenten (eine pro Typ, gemeinsam für beide Ansichten)

Props: `field`, `modelValue` (Speicherformat, bei übersetzbaren Feldern der Wert der aktiven Sprache), `issues` (für diesen Pfad), `id`. Label immer sichtbar über dem Feld, `hint` darunter, Fehler darunter in Rot mit Text (nicht nur Farbe), `aria-describedby`.

| Typ | Bedienung |
|---|---|
| text | `<input>`; `format` → `type=url/email/tel`; Zähler „12/140“ erst ab 80 % von `max` |
| longtext | `<textarea>` wächst mit; Zähler wie text |
| markdown | Profil `inline`/`basic`: Editor mit Absatz, Überschrift (2/3), Fett, Kursiv, Link, Liste (• und 1.); bei `inline` nur Schrift und Link, Enter = Zeilenumbruch. Speichert Markdown. Einfügen aus Word wird auf diese Knoten reduziert. Links nur http(s), mailto, tel, relativ; sonst Fehler am Link. Profil `rich`/`page` und Texte, die der Editor nicht zeigen kann (Tabelle, Zitat, Komponente): Markdown-Quelltext in einer Textarea (bis TipTap, Schritt E) |
| number | `<input inputmode=decimal>`, `unit` als Suffix, min/max/step |
| money | `<input inputmode=decimal>` mit Währungssuffix (€ / CHF); akzeptiert „12,5“, „12.50“, „12“; speichert `{ amount: Cent }`; zeigt „12,50“ |
| boolean | Schalter mit Text rechts (Label) |
| date | `<input type=date>`; dazu Kurzwahl „Heute“, „Morgen“ (in der Zeitzone der Seite) |
| time | `<input type=time>` |
| daterange | zwei Datumsfelder „von“/„bis“; „bis“ ≥ „von“ wird beim Ändern von „von“ nachgezogen |
| choice | ≤ 5 Optionen: Segmente; sonst `<select>` |
| choices | Chips zum An/Aus; bei Pflicht ohne Wert zusätzlich Chip **„Keine“** (setzt `[]`, schließt die anderen aus). Startwert bei `create` = **nicht gesetzt** (nicht `[]`), damit „keine“ bewusst gewählt wird |
| list | Zeilen als Karten mit `itemLabel` + Nummer; je Zeile [nach oben] [nach unten] [Entfernen]; [+ <itemLabel>] bis `max`; bei `min = max` kein Hinzufügen/Entfernen. Neue Zeile bekommt `_id` (10 Zeichen) vom Client. `unique`-Spalte mit fester Optionsliste (Wochentage) ist in der Zeile nur Text, nicht editierbar, wenn `min = max` |
| image | Foto wählen (`accept=image/*`, am Handy Kamera/Galerie) → Upload direkt in den Convex-Storage (`uploads.prepare` → Storage → `uploads.register`, SPEC 4.3) → „Wird verarbeitet …“ → Vorschau. **Alt-Text Pflicht** („Was ist zu sehen?“), leer bei neuem Foto (nie vom alten übernommen). [Entfernen] |
| file | PDF wählen → Upload (wie image) → „Wird geprüft …“ → Name + Größe; [Andere Datei] [Entfernen] |
| slug | nur Anzeige „Adresse: /veranstaltungen/weinabend-ebner“ (nach dem Anlegen fest) |

**Abhängige Pflichtangabe (Listenzeilen):** Ändert sich in einer Listenzeile ein Text-Feld, und die Zeile hat ein Pflicht-`choices`-Feld, das sich nicht geändert hat, wird dieses Feld markiert „Noch richtig?“ und muss vor dem Speichern einmal angetippt/bestätigt werden (Knopf „Ja, stimmt“). Grund: neues Gericht mit den Allergenen der Vorwoche.

## 6. Anmelden und Einladung

- `/login`: „E-Mail-Adresse“ [Code senden] → „Wir haben dir einen Code an a@b.at geschickt. Er gilt 5 Minuten.“ Feld „Code“ (6 Ziffern, `inputmode=numeric`, `autocomplete=one-time-code`) [Anmelden]. Leerzeichen um die E-Mail werden entfernt. Fehler: „Der Code stimmt nicht oder ist abgelaufen.“ Ohne Einladung kommt **dieselbe** Bestätigung (keine Auskunft, ob die Adresse existiert).
- Gehostet ohne Mail-Anbieter (SPEC 10): Die Seite zeigt nur „Anmeldung noch nicht eingerichtet.“
- `/invite/[token]`: nicht angemeldet → Login mit Rückkehr; angemeldet → „<Seite> lädt dich als <Rolle> ein.“ [Annehmen] → weiter zu `/s/<slug>`. Fehler `NOT_FOUND`: „Diese Einladung ist abgelaufen oder schon benutzt. Bitte frag nach einer neuen.“ Andere E-Mail: „Diese Einladung gilt für eine andere E-Mail-Adresse. Melde dich mit dieser an.“

## 7. Verlauf und Team

- Verlauf: Liste der `changes`, neueste oben: Satz (`sentence`), wer, wann („vor 5 Min.“, sonst Datum). [Rückgängig] nur bei `kind: save` und solange möglich; Fehler `NOT_UNDOABLE` → „Geht nicht mehr: Das Feld wurde danach noch einmal geändert.“
- Team: Mitglieder (E-Mail, Rolle, Rechte als Aufgaben-Labels), offene Einladungen mit [Zurückziehen]. [Einladen]: E-Mail, Rolle (Mitarbeiter; Inhaber nur für admin), Rechte als Liste der Aufgaben mit Häkchen, **alle aus** als Standard.

## 8. Aussehen

- Werkzeug, nicht Marke: ruhig, hell, gut lesbar im Sonnenlicht. Schrift: eine Sans (selbst gehostet, keine Anfragen an Dritte). 16 px Grundgröße am Handy, Ziele ≥ 48 px.
- Eine Akzentfarbe für Aktionen; Status nie nur über Farbe.
- Fokus immer sichtbar; Tastatur bedient alles; `prefers-reduced-motion` respektiert.

## 9. Abnahme

Playwright gegen lokales Convex (echte Mutationen, Login über `outbox`), 390 und 1440 px:
1. Wirtin: „Heute ausgebucht“ in ≤ 2 Taps nach dem Start; Hinweis steht in der Liste; Rückgängig entfernt ihn.
2. Wirtin: „Heute geschlossen“ mit Grund; Zustand „Heute: Heute geschlossen“ + [Aufheben].
3. Wirtin: Mittagsmenü dieser Woche: Woche ab = dieser Montag, Vorlage letzte Woche; Gericht am Dienstag ändern → Allergene „Noch richtig?“ muss bestätigt werden; speichern.
4. Koch: „Preis ändern“ → Suche „schnitz“ → Preis 22,50 → gespeichert; Wirtin hatte parallel denselben Preis geändert → Konflikt-Ansicht mit beiden Werten.
5. Koch sieht keine Aufgaben außerhalb seiner Grants (kein „Heute geschlossen“, kein Team).
6. Gericht hinzufügen ohne Allergene → Fehler am Feld; „Keine“ wählen → gespeichert.
7. Doppeltipp auf Speichern → genau ein Eintrag.
8. Login mit falschem Code → Fehlermeldung; richtiger Code → Start.
9. Einladung annehmen (neue Person) → landet in Schnell ändern mit ihren Aufgaben.
10. Alles bearbeiten: Veranstaltung mit Bild anlegen (Alt-Text Pflicht), Vorschau zeigt den ungespeicherten Titel.

Dazu ein **Walkthrough** (Haiku im Browser) als Wirtin am Handy und als Koch, ohne Hilfe; jede Stelle, an der sie hängen bleiben, wird ein Fix.

## 10. F6: Files, approvals, history detail, Studio basics (1.0, 11 October 2026)

English is the source wording; German goes in the same catalog keys. Studio namespaces: `files`, `review`, `history`, `basics`. Everything uses the existing shadcn-vue components of the Studio (Button, Dialog, Sheet, DropdownMenu, Command, Badge, Tabs) and the field patterns of section 5. No new colours or fonts.

### 10.1 Jobs

| Who | Job | Frequency | Situation | Must hold | Target |
|---|---|---|---|---|---|
| Owner, editor | Pick a photo or PDF for a field | weekly | in the entry form | the photo needs alt text; a recent upload is on top | 2 clicks from the field, or upload in place |
| Owner | Replace a file everywhere (this week's lunch PDF, a new team photo) | weekly to monthly | laptop or phone | every page that used it shows the new file; the old one can come back for 30 days | find it + 2 clicks |
| Owner | Fix missing alt text | after a hint | laptop | the list shrinks as you fix | one field per photo, no page change |
| Owner | See where a file is used, before removing it | rare | laptop | a used file cannot be deleted, only trashed | 1 click |
| Agency | Tidy up: folders, rename, move, remove unused | rare | laptop | nothing in use disappears | drag and drop, multi-select |
| Owner, admin | Approve or reject a change by staff or an agent | when it comes (mail) | phone or laptop | see before/after; never approve your own; a stale change cannot be approved | open mail link → 1 tap |
| Staff, agent | Know whether my change is live or waiting | after a save | phone | honest status: "Waiting for approval" | visible at the save and in history |
| Anyone | See what a change did, go back to an earlier version | after a mistake | laptop | going back is a normal save (can be undone) | 2 clicks from history |
| Editor | Jump to an entry or area by name | daily (agency), weekly (owner) | laptop | finds by title in all languages | ⌘K + 3 letters + Enter |
| Owner | Understand why an entry is not on the website | after confusion | anywhere | every reason in one sentence, with the fix action | 1 click from the entry status |
| Owner, admin | Update the website now (instead of in ~1 minute) | rare | anywhere | honest result: done or what failed | 1 click |
| Editor | Duplicate an entry, restore a removed one | monthly | laptop | duplicate is a draft; restore within 30 days | 2 clicks |
| Translator | See which entries miss or have outdated translations | per release | laptop | counts per language; click leads to the entry in that language | 1 click |

Evidence: V1.md, DEMOS.md (weekly lunch PDF, gallery photos), owner-editing patterns. Assumptions: owners pick files far more often than they browse the library; approval is off for solo owners and they see none of it.

### 10.2 Navigation

- Header nav: Quick edit · Edit everything · **Files** · History · Team · AI. Files is visible for everyone who may edit any file field.
- Approvers (owner, admin) with open proposals: a pill before the nav, `To review (n)` / `Zu prüfen (n)`, linking to `/s/[site]/review`. Hidden when n = 0 or approval is not used.
- ⌘K / Ctrl+K on every site page opens the command palette (10.6). The header shows a quiet search button `Search… ⌘K` on desktop, an icon button on the phone.

### 10.3 Files (`/s/[site]/files`, Finder)

Layout desktop: sidebar 220 px | grid or list | info panel 320 px (opens on selection). Phone: sidebar becomes a select at the top, the info panel a bottom sheet, no drag and drop (buttons instead).

- Sidebar views (`files.list` `view`): All files, Recent, Unused, Missing alt text (count badge), Duplicates, Trash; then Folders (tree, `files.folders`), `+ New folder`.
- Toolbar: search field `Search files`, view toggle Grid / List (remembered per browser), `Upload` button (also drag files anywhere on the page; drop target overlay "Drop to upload to <folder>").
- Grid: square thumbnails (PDF: icon + name), name below, a small "No alt text" badge where missing. List: name, type, size, dimensions, used in (count), date.
- Selection: click selects, ⌘/Ctrl/Shift-click multi-selects, Space opens quick look (large preview Dialog, arrows move, Esc closes). Drag selected items onto a folder to move.
- Info panel (one file): preview with focus point (click the image to set it, `files.setFocus`), name (inline rename), alt text field (per content language when the site has several; saves on blur, "Saved" next to it), type, size, dimensions, uploaded at/by, **Used in**: list of `<entry title> · <field> · <language>` links to the entry. Actions: `Replace file…` (upload; text: "Every page that uses it shows the new file. The old file is kept for 30 days."), `Download`, `Move to…`, `Remove`.
- Remove: unused → confirm "Remove <name>? You can restore it from Trash for 30 days." Used → button reads `Remove…` and the dialog says "<name> is used in n places. Remove it from those entries first." with the Used-in list; no destructive button.
- Multi-select panel: "n files selected", `Move to…`, `Remove` (only when all unused, else the same explanation with the used ones listed).
- Empty states: All "No files yet. Drag photos or PDFs here, or use Upload." Missing alt text "Every photo has a description." Unused "Every file is in use." Trash "Trash is empty. Removed files stay here for 30 days."
- Picker mode: the image and file fields get `Choose from library` next to `Choose photo` / `Choose PDF`. It opens the Finder in a large Dialog (Sheet on the phone) filtered to the field's type, Recent selected, single-select, primary button `Use this photo` / `Use this file`; upload inside the picker selects the new file. Missing alt text on the chosen photo asks for it before closing (the existing alt rule of the field).

### 10.4 Review (`/s/[site]/review`, approvals)

- Only approvers. List of open proposals, oldest first, grouped by release if any. Row: the history line (`historyText`), who (and "via <agent>"), when, a stale badge `No longer fits` with the reason.
- Row expands (or opens a Sheet on the phone) to the diff (10.5 component) and actions: `Approve`, `Approve for later…` (date-time in the site zone, same control as Publish later), `Reject…` (required sentence: "Why? The author sees this."). Own proposals show "You proposed this" and no actions. Stale: only `Reject…`.
- After an action: the row leaves with a toast "Approved. On the website in about a minute." / "Scheduled: online from <time>." / "Rejected." and Undo where the server allows it.
- Releases (agency): a section `Releases` with name, time, items; `Approve release` approves all; a stale item blocks it and says which.
- The proposal author sees their open proposals at the top of History under "Waiting for approval" with `Withdraw`, and the save toast for a proposal says "Sent for approval. <Approver role> decides." instead of "Saved".
- Mail links (digest) open `/s/[site]/review#<proposal>` with that row expanded.

### 10.5 History detail

- Each history row gets `Show changes` (toggles inline). The diff component (shared with Review): per field label, "Before" and "After" with the value rendered like in the list (`displayValue`); long text shows changed paragraphs only, with removed text struck through and added text marked (not only colour: `−`/`+` prefixes for screen readers).
- `Back to this version` on rows of saves: confirm "Go back to the version of <date>? This is saved as a new change, so you can undo it." Then a normal save (`entries.revert`).
- A History filter: All · Mine · Via AI · This entry (when opened from an entry: the entry's "More" menu gets `History of this entry`).

### 10.6 Studio basics

- **Command palette (⌘K):** shadcn Command in a Dialog. Empty query: Recent entries (last 5 opened), then actions: `New <brick>` for each creatable brick, `Files`, `History`, `Review` (approvers), `Update website now` (owner/admin). Typing searches `search.studio` (entries by title in all languages, areas by label); results show the area label and status badge. Enter opens; ⌘Enter opens in a new tab.
- **Why not on the website:** in the entry status line, when the entry is not live: link `Why not on the website?` → Popover with each reason (`historyText` of `whyNotPublic` reasons) and its action button where one exists (Publish…, Restore, Edit translation). When live: no link.
- **Update website now:** site menu item for owner/admin. While running: "Updating the website…"; done: toast "The website is up to date."; failure: toast with the server message and "It updates by itself within a few minutes." Show "Last update: <relative time>" under it when `sites.lastRefreshAt` exists.
- **Duplicate:** entry "More" menu `Duplicate` → creates a draft copy titled "<title> (copy)" and opens it, toast "Copy created as a draft."
- **Trash per site:** Edit everything shows `Removed (n)` at the end of the area list when n > 0 → list of removed entries of all areas with `Restore` and the date when they are deleted for good.
- **Translation status:** in Edit everything, each area row shows per non-main language a badge `EN: 3 missing` / `EN: 1 outdated` (`sites.translationStatus`); the area list shows the same per entry; clicking opens the entry with that language selected.
- **Saved views:** in an area list: search box + sort select; `Save view…` (name) stores the current search and sort (`views.save`); saved views appear as chips above the list, with remove in the chip menu. Nothing else (no filter builder in 1.0).

### 10.7 Acceptance (Playwright, local Convex, 390 and 1440 px)

1. Pick a photo from the library for an event; the photo has no alt text → the picker asks for it; saved.
2. Replace the lunch PDF in Files → the entry that used it links the new file; Trash is not involved; restore the old file is possible (kept 30 days).
3. Try to remove a used photo → the dialog lists where it is used; no destructive button.
4. Missing alt text view: fix one → the count drops by one without reload.
5. Staff saves a task with `needsApproval` → toast "Sent for approval…"; owner sees `To review (1)`, approves → live; staff's History shows it done.
6. Owner rejects with a sentence → staff sees the sentence in History.
7. History: Show changes on a price change shows before/after; Back to this version → new save; Undo works.
8. ⌘K "schni" + Enter opens the Schnitzel entry.
9. A draft entry: Why not on the website? lists "The entry is a draft…" with `Publish…`.
10. English and German UI both pass 1–9 (language spec extended).
