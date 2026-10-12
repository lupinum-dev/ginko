# Inhalte aus Dateien (Phase 13, `@lupinum/ginko-content`)

Stand: Entwurf 10.10. Ergänzt SPEC.md; was hier nicht steht, gilt wie dort.

## Ziel

Eine Seite kann Bausteine aus Markdown-Dateien im Git-Repo füllen statt aus der Plattform: Doku, Blog, Rechtstexte, die Entwickler pflegen. Die Seite liest sie **über denselben Weg** wie Plattform-Inhalte: dasselbe Bundle, `useGinko`, `useGinkoEntry`, Routen, Sitemap, Sprachen über ginko-i18n. Ein Baustein hat genau eine Quelle.

## Entscheidungen

1. **Quelle pro Baustein:** `collection({ source: 'files', … })` oder `single({ source: 'files', … })`. Standard bleibt die Plattform.
2. **Die Plattform sieht Datei-Bausteine nie.** `platformSchema(schema)` entfernt sie; `ginko release`, `ginko check` und `ginko dev` senden nur dieses Schema. An der Plattform ändert sich nichts.
3. **Ein Bundle-Weg:** Beim Build (und im Dev bei jeder Dateiänderung) liest das Modul `content/`, baut daraus `StoredEntry`s und ruft den vorhandenen `buildBundle` des Kerns. Sichtbarkeit, Reihenfolge, URLs, Fallbacks und Standardwerte gelten also unverändert. Das Plugin legt die Datei-Bausteine über das Plattform-Bundle. Eine Seite ohne Plattform-Bausteine fragt die Plattform nie (kein 503, keine Plattform-Adresse nötig).
4. **Ein Textformat (Schritt B, 11.10.; ersetzt die frühere Trennung richtext/markdown):** Feldtyp `markdown` mit Profil (SPEC 7). Im Datei-Baustein ist er der Text der Datei. Beim Build wird er mit dem Kern-Parser plus Shiki geparst; das Bundle trägt den Baum (`{ nodes, toc }`), zur Laufzeit gibt es keinen Parser. Darstellung: `<GinkoMarkdown :value>`, Komponenten registriert die Seite selbst. Vertrauen regelt das Profil: Inhaber-Felder bekommen `basic`, Doku-Seiten `page`. Welche Komponenten `page` kennt, steht im Komponenten-Register von `defineSite({ components })` (SPEC 7); Dateien, Plattform, Editor und Agenten prüfen dagegen gleich.
   Zusätze im Text: Fußnoten (`basic`), Emoji-Kürzel (alle Profile), Formeln und Mermaid (`rich`). Steht `<!-- more -->` allein in einer Zeile, ist der Text davor der Anriss: `value.summary` (Knoten), nur wenn die Zeile existiert; die Zeile selbst fällt aus dem Baum. KaTeX und mermaid.js sind nicht im Ginko-Bundle: `<GinkoMarkdown>` zeigt Formeln als `<code class="math">` und Diagramme als `<pre class="mermaid">` (Quelltext). Die Seite schaltet echtes Rendern selbst ein: entweder eigene Komponenten `:components="{ math: Math, mermaid: Mermaid }"` (die Props sind `content` und `class`), oder mermaid.js auf der Seite laden und auf `pre.mermaid` starten.
5. **Parser:** `comark` direkt (Parser, Shiki-, TOC-, Komponenten-Plugins). Aus dem alten `ginko-content` (39.000 Zeilen) übernehmen wir keinen Code, nur seine Testfälle als Vorlage, wo sie passen.
6. **Statische Seite:** Hat eine Seite nur Datei-Bausteine, baut `nuxt generate` sie vollständig nach `.output/public` (Seiten, Navigation, Suche, Sitemap, robots.txt, llms.txt, `.md`-Seiten, Weiterleitungen) für jeden statischen Host. Dafür enden die JSON-Routen auf `.json` (`/__ginko/files/<locale>.json`).

## Dateien

```
content/
  docs/                       # collection `docs`
    1.einstieg.md             # Hauptsprache; die Zahl ist die Reihenfolge (order: 'manual')
    1.einstieg.en.md          # Übersetzung: gleicher Name + .<locale>
    2.bausteine.md
  rechtliches.md              # single `rechtliches` (Hauptsprache)
  rechtliches.en.md
```

- **Frontmatter** (YAML) = Felder des Bausteins in einfacher Form: Text als String (die Sprache kommt aus dem Dateinamen), Geld als `12.50`, Datum `YYYY-MM-DD`, Liste als Array (bei genau einem Unterfeld auch als einfache Werte: `tags: [a, b]`), Bild als Pfad unter `public/` mit `alt`.
- **Body** → das eine `markdown`-Feld des Bausteins. Mehr als ein `markdown`-Feld ist ein Fehler.
- **Slug:** Feld `slug` mit `from`, wie auf der Plattform. Ohne Frontmatter-Wert: aus dem Dateinamen ohne Zahl (`einstieg`); die Übersetzung darf `slug:` setzen.
- **`updatedAt` und `source`:** Jeder Eintrag bekommt `updatedAt` (letzter Commit auf Hauptdatei oder Übersetzung, sonst Zeit der Datei; ein `git log` pro Build, `packages/ginko-content/src/git.ts`) und `source` (Pfad der Datei dieser Sprache relativ zum Repository, sonst der Hauptdatei, z. B. `content/docs/1.einstieg.en.md`; ohne Repository relativ zum Elternordner von `content/`). Auf flachen Klonen (CI mit `--depth 1`) tragen alle Dateien die Zeit des einen Commits.
- **Id:** Pfad ohne Sprache und Endung (`docs/einstieg`), stabil, solange die Datei heißt wie sie heißt.
- **Übersetzungen sind immer aktuell** (Prints = Hauptsprache zur Build-Zeit). Fehlt eine Übersetzung, greift der normale Fallback (`missing: 'fallback' | 'hide'`).
- **Fehler brechen den Build** mit Datei und Feld: `validate()` des Kerns prüft jeden Eintrag; unbekannte Frontmatter-Schlüssel, falsche Sprache im Namen und doppelte Slugs und doppelte URLs (auch durch den Slug-Fallback auf die Hauptsprache) sind Fehler.

## Bilder

Bildfelder lösen sich zu `{ url, alt, width, height }` auf (Größe aus den ersten 64 KiB der Datei); `<GinkoImage :image sizes? eager?>` (Nuxt-Modul) rendert `<img>` mit `width`/`height`, `loading="lazy"` (`eager`: `loading="eager"` + `fetchpriority="high"`), `decoding="async"`, und nichts bei `undefined`. Kein `srcset`: es gibt noch keinen Bilddienst.

Bilder im Markdown-Text: `![Alt](./cover.jpg)` neben der Datei (auch `x.jpg`, `../shared/x.png`). Beim Lesen wird der Pfad gegen den Ordner der Datei aufgelöst; er muss in `content/` bleiben, die Datei muss existieren (sonst Fehler mit Datei). Der Knoten bekommt `src="/_ginko/img/<16 Hex von sha256 der Bytes>.<ext>"` sowie `width`/`height`; das Nuxt-Modul kopiert genau diese Bilder (nie Markdown oder Daten) in einen Build-Ordner, den Nitro unter `/_ginko/img/` mit `max-age` ein Jahr ausliefert (Dev: neu geschrieben bei jedem Rebuild). `/…`-Quellen unter `public/` bekommen nur `width`/`height`; `https://`-Quellen bleiben unverändert.

## Datendateien

Neben `.md` kennt ein Datei-Baustein `.yml`, `.yaml`, `.json` und `.csv`. Alle Werte laufen durch dieselbe Umwandlung und Prüfung wie Frontmatter.

- **`.yml`, `.yaml`, `.json`** = ein Eintrag, Name wie bei `.md` (`[n.]name[.locale].endung`). Die ganze Datei sind die Felder, es gibt keinen Body. Hat der Baustein ein `markdown`-Feld, ist das ein Fehler mit Dateiname.
- **`.csv`** = viele Einträge, nur für Sammlungen. Kopfzeile = Feldnamen. Pflichtspalte `slug` (Name und Id: `docs/<slug>`), optionale Spalte `locale` (leer = Hauptsprache; eine Übersetzung ist eine Zeile mit gleichem `slug`). Trenner `,` oder `;` (nach der Kopfzeile erkannt), Werte in `"…"` dürfen Zeilenumbrüche und `""` enthalten. Zahlen und Geld nur mit Punkt (`12.5`); `12,5` ist ein Fehler. Leere Zelle = Feld fehlt. Listen, Bilder, `choices` und `daterange` gehen nicht in CSV. Reihenfolge = Zeilenfolge.
- **`draft: true`** (Frontmatter, YAML, JSON oder Spalte `draft`) ist reserviert: Der Eintrag fehlt im Build (`readContent(…, { drafts: false })`); das Ginko-Modul setzt das außerhalb von `dev`.
- **`redirectFrom`** (Frontmatter, YAML oder JSON; nur in der Datei der Hauptsprache) ist reserviert: ein Pfad oder eine Liste alter Pfade (jeder beginnt mit `/`), die mit 301 auf die Adresse des Eintrags weiterleiten. Zusammen mit `redirects` in `defineSite` (SPEC Teil 8).
- Fehler tragen eine Zeile (`line`): YAML-/JSON-Syntaxfehler und jede CSV-Zeile.

## Links zwischen Seiten

- `[Beitrag]($blog.mein-beitrag)` verlinkt einen Eintrag per Name: `$<baustein>.<slug>` (oder die Id `baustein/slug`). Der Link wird beim Bauen zur Adresse in der Sprache der Seite. `$page.<key>` verlinkt eine Seite aus `pages`. Ein Anker bleibt erhalten: `$blog.mein-beitrag#preise`.
- Textbausteine: `::snippet{name="oeffnungszeiten"}` wird durch das Feld `body` des Eintrags `snippets/oeffnungszeiten` aus der Sammlung `snippets` ersetzt (eine Ebene tief; ein Baustein im Baustein bleibt stehen).
- Was sich nicht auflösen lässt, bleibt stehen und trägt `data-broken`.
- Link-Prüfung (`checkLinks`, läuft im Build über die Datei-Bündel): Fehler bei kaputten `$`-Links, fehlenden Textbausteinen und `/…`-Pfaden ohne Eintrag, Seite oder Datei in `public/` (nur bei Seiten ohne Plattform-Bausteine); Warnung bei fehlendem `#anker`. Fehler brechen den Produktions-Build ab. Einstellung in `defineSite`: `links: { broken: 'error' | 'warn' | 'off', anchors: 'error' | 'warn' | 'off' }`. Externe Links werden nicht geprüft.

## API

```ts
// ginko.config.ts
docs: collection({
  source: 'files',
  label: 'Doku',
  fields: { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }), body: f.markdown('Text') },
  max: 500, order: 'manual',
  route: { de: '/doku/[slug]', en: '/en/docs/[slug]' },
})
```

```vue
<GinkoMarkdown :value="entry.data.body" :components="{ callout: Callout }" />
```

- `@lupinum/ginko-content` (Node): `readContent(contentDir, publicDir, schema) → { entries, files, errors }`, `parseMarkdown(text) → { frontmatter, value }`.
- `@lupinum/ginko-content/vue`: `<GinkoMarkdown>`.
- Das Ginko-Modul lädt `@lupinum/ginko-content` nur, wenn ein Baustein `source: 'files'` hat; fehlt das Paket, sagt der Fehler, was zu installieren ist.

## Phase 14: Doku-Preset

1. **Markdown-Texte laden pro Seite.** Das Bundle in `ginko:bundle` (Payload jeder Seite) trägt für `markdown`-Felder nur `{ ref, toc }`. `<GinkoMarkdown>` (Nuxt-Seite, im Ginko-Modul) holt den Baum über `/__ginko/files/<locale>/md/<brick>/<id>/<field>.json` mit `useAsyncData`: der Payload enthält nur die Texte, die diese Seite zeigt. `toc` bleibt im Bundle (Überschriften für Listen und Navigation).
2. **Suche:** `/__ginko/search/<locale>.json` beim Build: ein Eintrag pro Abschnitt (Text vor der ersten h2, dann je h2/h3 mit Anker), Index mit deutschem Stemming und Umlaut-Faltung. Die Suche im Browser lädt die Datei beim ersten Öffnen (`@lupinum/ginko/search`, MiniSearch).
3. **`@lupinum/ginko-docs`** als Nuxt-Layer: Layout (Seitenleiste nach Reihenfolge und optionalem Feld `section`, Inhaltsverzeichnis, Suche, Sprachwechsel), Seiten `/` und `/docs/[slug]`, Komponenten für Markdown: `callout`, `tabs`/`tab`, `code-group`, `steps`, `cards`/`card`. Die Seite liefert `ginko.config.ts` mit `docs: docsCollection({ route })` und ihre Inhalte.
4. **Fertig, wenn** `sites/docs` nur noch Config, Inhalte und Branding hat, die Ginko-Doku (Einstieg, Bausteine, Sprachen, Inhalte aus Dateien, Plattform, CLI) darauf läuft, und `check-site` plus e2e grün sind.

## Für KI-Agenten

Jeder Eintrag mit Route gibt es auch als Markdown: `<seite>.md` (`/docs/einstieg` wird `/docs/einstieg.md`), oder dieselbe URL mit `Accept: text/markdown`. Jede HTML-Seite nennt ihr Markdown im Header `Link: <...>; rel="alternate"`. `/llms.txt` listet die Einträge der Hauptsprache mit diesen Links, `/llms-full.txt` enthält ihr Markdown in einer Datei. Die Markdown-Bäume kommen aus `#ginko/files-md`, ohne Umweg über den Browser. Abschalten oder Beschreibung setzen: `agents: { enabled, description }` in `ginko.config.ts`; eine eigene `public/llms.txt` hat Vorrang.

## Später (nicht in Phase 14)

Bildgrößen aus der Datei, `nuxt generate` für rein statische Seiten.

## Fertig, wenn

- `sites/docs` (neu, Grundlage für Phase 14) hat `docs` aus Dateien in de und en, rendert Markdown mit Code-Hervorhebung und einer eigenen Komponente, fragt die Plattform nie, und `check-site` ist grün.
- Die drei Demo-Seiten bleiben unverändert grün (Plattform-Weg unberührt).
- Tests: Datei → Eintrag (Tabelle über Feldtypen), Fehlerfälle mit Datei/Feld, Übersetzung fehlt → Fallback, `platformSchema` entfernt Datei-Bausteine, `checkSchema` lehnt `markdown` außerhalb von Datei-Bausteinen ab, Merge Plattform + Dateien.
