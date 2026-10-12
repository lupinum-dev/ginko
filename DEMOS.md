# Drei Demos (Anforderungen)

> Historisch (Stand 8.10.2026). Seit Schritt B (11.10.) ist Markdown das einzige Textformat; `richtext`, AST v1 und `<GinkoRichText>` gibt es nicht mehr. Gültig sind `SPEC.md` und `V1.md`.

Reihenfolge: **zuerst das Restaurant komplett** (gebaut, getestet, gebrochen, deployt). Industrie und SaaS laufen bis dahin nur als Schema-Testfälle mit (SPEC Teil 14).

Ziel: Drei erfundene, aber realistische Firmen decken zusammen etwa 80 % dessen ab, was kleine und mittlere Kunden im DACH-Raum auf ihrer Website pflegen. Jede Demo ist eine eigene Nuxt-Seite unter `sites/` und nutzt nur `@lupinum/ginko`. Alle Inhalte sind erfunden.

Jede Anforderung wird ein Test (Unit, Convex oder Playwright). Was hier nicht steht, gehört nicht in v1.

## Gemeinsam für alle drei (DACH)

| Anforderung | Warum | Umsetzung |
|---|---|---|
| Impressum, Datenschutz | Pflicht (DDG §5 DE, ECG/MedienG AT, Schweiz) | Einzelstück `legal` als Preset, Rich Text, `translate: 'manual'` |
| Öffnungs- bzw. Erreichbarkeitszeiten mit Ausnahmen | Feiertage und Urlaub ändern sich je Bundesland und Jahr | Preset `hours`: Woche + Ausnahmen (Datum oder Zeitraum, Grund) + „Heute zu“ |
| Hinweis-Banner | „Heute ausgebucht“, „Messe nächste Woche“, „Wartung“ | Preset `notices`, mit Ablaufdatum |
| Preise in EUR und CHF | DACH | Feldtyp `money` (Cent als Ganzzahl + Währung), Anzeige `12,50 €` / `CHF 12.50` |
| Umlaute in Adressen | `/über-uns` soll `/ueber-uns` werden | `f.slug` wandelt ä→ae, ö→oe, ü→ue, ß→ss |
| Datum und Zeit | `08.10.2026`, `09:00–18:00`, Zeitzone der Seite | Formatierung in der Seite, „heute“ auf dem Server |
| SEO pro Seite und Eintrag | Titel, Beschreibung, Teilen-Bild | Preset `seo` als Feldgruppe, Sitemap aus URL-Karten |
| Keine Cookies, Schriften selbst gehostet | DSGVO | in jeder Demo-Seite, geprüft per Test (keine Anfragen an Dritte) |
| Bilder mit Alt-Text | Barrierefreiheit (BFSG ab 2025 in DE) | Feldtyp `image`, Alt-Text Pflicht, EXIF/GPS entfernt |
| Dateien (PDF) | Datenblätter, Speisekarte als PDF, AGB | Feldtyp `file`, Größenlimit |
| Rich Text sicher | Links nur http(s)/mailto/tel/relativ | AST v1, `<GinkoRichText>` |
| Mehrsprachig | Export-Firmen, SaaS, Tourismus | Industrie und SaaS: DE + EN. Restaurant: DE + EN. Speicherung ist immer sprachfähig |

Neue Feldtypen gegenüber v3: `number`, `money`, `choices` (Mehrfachauswahl), `file`, `daterange`. `text` bekommt `format: 'url' | 'email' | 'tel'`.

## Demo 1: Industrieunternehmen („Brunner Präzisionstechnik GmbH“, Steyr, AT)

Mittelständischer Maschinenbau-Zulieferer, 180 Mitarbeitende, Export. Inhalte pflegt die Marketing-Assistenz am Desktop. Stellen pflegt HR.

| Wer | Aufgabe | Häufigkeit | Muss stimmen |
|---|---|---|---|
| HR (Mitarbeiterin) | Stelle ausschreiben, beenden | monatlich | **AT: Mindestgehalt im Inserat Pflicht** (GlBG §9), Ablaufdatum |
| Marketing | News/Presse mit Bild und PDF | 2× im Monat | Rich Text, Bild, Datum, DE + EN |
| Marketing | Messe-Termin eintragen | 4× im Jahr | Zeitraum, Stand-Nr., läuft von selbst ab |
| Marketing | Produkt/Leistung mit Datenblatt | selten | Technische Daten als Liste, PDF |
| Marketing | Ansprechpartner ändern | selten | Foto, Rolle, Telefon, E-Mail |
| Geschäftsführung | Zertifikate (ISO 9001) erneuern | jährlich | PDF, Gültig bis |

Bausteine: `hours` (Empfang), `notices`, `news` (Sammlung), `jobs` (Sammlung: Titel, Ort, Art Vollzeit/Teilzeit/Lehre, Gehalt ab `money` + Zeitraum Monat/Jahr, Start, Ablauf, Kontakt, Bewerben-Link oder -E-Mail), `events` (Sammlung: Titel, `daterange`, Ort, Stand), `products` (Sammlung: Name, Kurztext, Bilder, technische Daten als Liste Name/Wert/Einheit, Datenblatt `file`), `contacts` (Sammlung), `certificates` (Sammlung), `legal`.

Gestaltung (9.10.): nüchterner Maschinenbau. IBM Plex Sans und Plex Mono (Zahlen, technische Daten, Gehälter, Stand-Nummern), Papier `#f3f3ef`, Tinte `#14171a`, Stahlblau `#1f3a52` für Knöpfe, Signal-Orange `#e05a1b` nur für dünne Markierungen (aktive Navigation, Hinweis-Kante). Feine Linien statt Schatten, kein Stockfoto-Hero, sondern ein Faktenkasten (Mitarbeitende, Exportländer, Zertifikat mit Gültigkeit aus den Inhalten). Stellen zeigen das Gehalt prominent („ab € 3.200 brutto / Monat“), weil es in AT Pflicht ist. Firmenadresse pflegt die Firma selbst (Baustein `company`).

Was diese Demo prüft: **Rolle „Mitarbeiter mit Aufgaben“** (HR sieht nur Stellen), Ablauf von selbst, Dateien, Mehrsprachigkeit, große Sammlungen nahe am Maximum.

## Demo 2: SaaS („Taktwerk“, Zeiterfassung für Handwerksbetriebe, Berlin/Zürich)

Kleines Software-Team, Gründerin pflegt am Laptop. Marketing-Seite plus Changelog.

| Wer | Aufgabe | Häufigkeit | Muss stimmen |
|---|---|---|---|
| Gründerin | Preise ändern | selten | **Preise exakt**, EUR und CHF, monatlich/jährlich, „zzgl. MwSt.“ |
| Entwickler | Changelog-Eintrag | wöchentlich | Version, Datum, Rich Text, Tags (Neu/Verbessert/Behoben) |
| Gründerin | Ankündigungs-Banner (Wartung, Launch) | monatlich | Zeitraum, Link, läuft ab |
| Marketing | Blog-Artikel | 2× im Monat | Rich Text, Bild, Autor, SEO |
| Marketing | Kundenstimme | selten | Zitat, Name, Firma, Logo |
| Gründerin | FAQ pflegen | selten | Reihenfolge wichtig |
| Gründerin | AGB/AVV ändern | selten | nie maschinell übersetzt |

Bausteine: `hero` (Einzelstück: Überschrift, Text, Knopf-Text, Knopf-Link), `features` (Liste), `pricing` (Sammlung: Plan, Preis/Monat und Preis/Jahr als `money` je Währung, Funktionen als Liste, „beliebt“-Markierung, Reihenfolge), `changelog` (Sammlung), `blog` (Sammlung), `testimonials` (Sammlung), `faq` (Sammlung, manuelle Reihenfolge), `notices`, `legal` (AGB, Datenschutz, AVV).

Gestaltung (9.10.): Werkzeug für Handwerksbetriebe, nicht „SaaS-Lila“. Archivo (breit, kräftig) für Überschriften, Public Sans für Text, JetBrains Mono für Versionen und Preise. Papier `#fafaf7`, Tinte `#111418`, Tannengrün `#0e4f4a` für Knöpfe, Signalgelb `#f2c230` als Markierung mit dunkler Schrift (beliebter Plan, „Neu“ im Changelog), wie Absperrband auf der Baustelle. Preise mit Umschalter Monat/Jahr und EUR/CHF ohne Cookie; Hinweis „zzgl. MwSt.“ bzw. „zzgl. MWST“. Impressum und AVV als eigene Seiten.

Was diese Demo prüft: **Geld exakt** (keine Rundungsfehler), Reihenfolge, Agent-Vorschläge (Changelog aus Release-Notes), `translate: 'manual'`, Choice-Fallback.

## Demo 3: Restaurant („Gasthaus zur Linde“, Salzburg, AT)

Familienbetrieb, Wirtin pflegt auf dem Handy zwischen den Services. Das ist die wichtigste Kit-Demo.

| Wer | Aufgabe | Häufigkeit | Muss stimmen |
|---|---|---|---|
| Wirtin | „Heute geschlossen“ / „Heute ausgebucht“ | wöchentlich | 2 Taps, auf der Seite nach ~1 Minute (die UI sagt das ehrlich), läuft von selbst ab |
| Wirtin | Mittagsmenü der Woche | **wöchentlich, Montag früh** | Mo–Fr je Gericht + Preis + Allergene |
| Koch | Gericht auf der Karte ändern, Preis ändern | monatlich | **14 Allergene nach LMIV, in AT als Codes A, B, C, D, E, F, G, H, L, M, N, O, P, R**; „keine“ ist eine bewusste Angabe, vegetarisch/vegan |
| Wirtin | Betriebsurlaub eintragen | 2× im Jahr | Zeitraum, Banner davor |
| Wirtin | Veranstaltung (Weinabend) | monatlich | Datum, Preis, Reservierungs-Link |
| Wirtin | Fotos der Galerie | selten | Handy-Foto, GPS entfernen |
| Wirtin | Adresse, Telefon, E-Mail (Fußzeile, Startseite) | selten (Umzug, neue Nummer) | Telefon als Link wählbar, Format geprüft; keine Schnellaufgabe, in „Alles bearbeiten“ unter „Adresse und Kontakt“ |

Bausteine: `hours` (mit Ruhetag und Betriebsurlaub), `notices`, `lunch` (Einzelstück: Woche ab, Tage Mo–Fr mit Gericht, Preis, Allergene, Hinweis), `menu` (Sammlung von Kategorien mit Gerichten: Name, Beschreibung, Preis, Allergene `choices` A–R, vegetarisch/vegan, Reihenfolge), `events`, `gallery` (Liste von Bildern), `legal`.

Aufgaben in „Schnell ändern“: „Heute zu“, „Heute ausgebucht“, „Mittagsmenü dieser Woche“ (Vorlage: letzte Woche kopieren), „Preis ändern“, „Betriebsurlaub“.

Was diese Demo prüft: **Handy-Bedienung unter Zeitdruck**, schlechtes Netz (Doppeltipp, Wiederholung), wöchentliche Pflege mit Vorlage, Allergene (Pflichtangabe), Konflikt Wirtin vs. Koch am gleichen Gericht.

## Abnahme pro Demo

1. Alle Aufgaben aus der Tabelle laufen im Browser durch (Playwright), auf dem Handy (390 px) und am Desktop.
2. Ein Walkthrough als die Person (Haiku im Browser) schafft jede häufige Aufgabe ohne Hilfe.
3. Break-it: Sol (Browser-Modus) und Haiku versuchen, Daten zu verlieren, fremde Seiten zu ändern, die Seite zu brechen und Script einzuschleusen. Jeder Fund wird ein Test.
4. Astra-Review nach jeder Phase. Es darf kein P0/P1 offen bleiben.
5. Ein Schema-Release mit Umbenennung (neues Feld + Migration) pro Demo, danach ein Vercel-Rollback auf die alte Version. Die Seite darf nicht brechen.
