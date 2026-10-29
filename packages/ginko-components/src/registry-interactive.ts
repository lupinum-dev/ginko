// Registry entries of the interactive components (tabs, accordion, ...). Spread into `components` in `registry.ts`.
// Pure data, no Vue. The Vue side is `runtime/components/interactive.ts`; the tag names are the keys of its map.
import { f } from '@lupinum/ginko'
import { defineComponents } from '@lupinum/ginko/internal'
import { appearance, iconifyIcon as icon, title } from './fields.ts'

const href = (label: { de: string; en: string }, optional: boolean) => f.text(label, { optional, max: 500 })

export const interactiveComponents = defineComponents({
  tabs: {
    kind: 'block',
    label: { de: 'Reiter (Tabs)', en: 'Tabs' },
    describe: {
      de: 'Zeigt mehrere Inhalte als Reiter, von denen immer einer sichtbar ist.',
      en: 'Shows several contents as tabs; one of them is always visible.',
    },
    props: {
      variant: f.choice({ de: 'Reiterform', en: 'Tab style' }, {
        options: [
          { value: 'separate', label: { de: 'Schaltflächen über dem Rahmen', en: 'Buttons above the frame' } },
          { value: 'line', label: { de: 'Unterstrichen, ohne Rahmen', en: 'Underlined, no frame' } },
        ],
        optional: true, default: 'separate',
      }),
      padded: f.boolean({ de: 'Innenabstand', en: 'Inner space' }, { optional: true, default: true, hint: { de: 'Aus: ein Codeblock füllt den Reiter.', en: 'Off: a code block fills the tab.' } }),
      appearance,
    },
    children: ['tab'],
    editor: { group: { de: 'Interaktiv', en: 'Interactive' }, keywords: ['tabs', 'reiter', 'reitergruppe', 'register', 'tab', 'panels'], example: ':::tabs\n::tab{title="npm"}\nInstalliere das Paket mit npm.\n::\n::tab{title="pnpm"}\nInstalliere das Paket mit pnpm.\n::\n:::' },
  },
  tab: {
    kind: 'block',
    label: { de: 'Reiter', en: 'Tab' },
    describe: { de: 'Ein Reiter innerhalb einer Reitergruppe.', en: 'A tab inside a tab group.' },
    props: { title: f.text({ de: 'Name', en: 'Name' }, { max: 40 }), icon },
    parents: ['tabs'],
    editor: { group: { de: 'Interaktiv', en: 'Interactive' }, example: ':::tabs\n::tab{title="Erster"}\nInhalt des ersten Reiters.\n::\n::tab{title="Zweiter"}\nInhalt des zweiten Reiters.\n::\n:::' },
  },
  accordion: {
    kind: 'block',
    label: { de: 'Aufklappliste', en: 'Accordion' },
    describe: {
      de: 'Eine Liste von Einträgen, die sich einzeln aufklappen lassen.',
      en: 'A list of entries that open one by one.',
    },
    props: {
      multiple: f.boolean({ de: 'Mehrere zugleich offen', en: 'Several open at once' }, { optional: true, hint: { de: 'Sonst schließt das Öffnen eines Eintrags die anderen.', en: 'Otherwise opening one entry closes the others.' } }),
      appearance,
    },
    children: ['accordion-item'],
    editor: { group: { de: 'Interaktiv', en: 'Interactive' }, example: ':::accordion\n::accordion-item{title="Wie melde ich mich an?"}\nPer E-Mail mit einem Code.\n::\n::accordion-item{title="Kostet das etwas?"}\nNein.\n::\n:::' },
  },
  'accordion-item': {
    kind: 'block',
    label: { de: 'Aufklapp-Eintrag', en: 'Accordion item' },
    describe: {
      de: 'Ein Eintrag der Aufklappliste, mit Überschrift und Text.',
      en: 'An entry of the accordion, with heading and text.',
    },
    props: {
      title: f.text({ de: 'Überschrift', en: 'Heading' }, { max: 120 }),
      open: f.boolean({ de: 'Geöffnet', en: 'Open' }, { optional: true }),
    },
    parents: ['accordion'],
    editor: { group: { de: 'Interaktiv', en: 'Interactive' }, example: ':::accordion\n::accordion-item{title="Erste Frage" open}\nDie Antwort steht schon offen.\n::\n:::' },
  },
  collapse: {
    kind: 'block',
    label: { de: 'Aufklappbereich', en: 'Collapsible section' },
    describe: {
      de: 'Ein Bereich mit Überschrift, den Leser auf- und zuklappen, oder langer Inhalt, gekürzt hinter „Mehr anzeigen“.',
      en: 'A section with a heading that readers can open and close, or long content cut off behind “Show more”.',
    },
    props: {
      title: f.text({ de: 'Überschrift', en: 'Heading' }, { optional: true, max: 120, hint: { de: 'Ohne Überschrift wird langer Inhalt gekürzt und lässt sich mit „Mehr anzeigen“ ganz öffnen.', en: 'Without a heading, long content is cut off and opens fully with “Show more”.' } }),
      open: f.boolean({ de: 'Geöffnet', en: 'Open' }, { optional: true }),
      appearance,
    },
    editor: { group: { de: 'Interaktiv', en: 'Interactive' }, example: '::collapse{title="Mehr Details"}\nHier steht der längere Text.\n::' },
  },
  steps: {
    kind: 'block',
    label: { de: 'Schritte', en: 'Steps' },
    describe: {
      de: 'Nummerierte Schritte; jede Überschrift im Block beginnt einen Schritt.',
      en: 'Numbered steps; each heading in the block starts a step.',
    },
    props: { mode: f.choice({ de: 'Zeichen', en: 'Marker' }, {
      options: [
        { value: 'numbered', label: { de: 'Nummer', en: 'Number' } }, { value: 'check', label: { de: 'Haken', en: 'Check' } },
      ],
      optional: true, default: 'numbered',
    }), appearance },
    editor: { group: { de: 'Layout', en: 'Layout' }, example: '::steps\n### Konto anlegen\nÖffne die Startseite.\n\n### Seite füllen\nTrage die Texte ein.\n::' },
  },
  cards: {
    kind: 'block',
    label: { de: 'Karten', en: 'Cards' },
    describe: { de: 'Ordnet Karten nebeneinander an.', en: 'Puts cards side by side.' },
    props: { cols: f.choice({ de: 'Spalten', en: 'Columns' }, {
      options: [
        { value: '1', label: { de: 'Eine', en: 'One' } }, { value: '2', label: { de: 'Zwei', en: 'Two' } }, { value: '3', label: { de: 'Drei', en: 'Three' } },
      ],
      optional: true, default: '2',
    }), appearance },
    children: ['card'],
    editor: { group: { de: 'Layout', en: 'Layout' }, example: ':::cards\n::card{title="Erste Karte" href="/"}\nKurzer Text.\n::\n::card{title="Zweite Karte"}\nNoch ein Text.\n::\n:::' },
  },
  card: {
    kind: 'block',
    label: { de: 'Karte', en: 'Card' },
    describe: {
      de: 'Eine Karte mit Titel, Text und auf Wunsch Bild und Link.',
      en: 'A card with title, text and optionally an image and link.',
    },
    props: {
      title,
      description: f.text({ de: 'Kurztext', en: 'Summary' }, { optional: true, max: 200 }),
      footer: f.text({ de: 'Fußzeile', en: 'Footer' }, { optional: true, max: 120 }),
      href: href({ de: 'Link', en: 'Link' }, true),
      icon,
      iconColor: f.choice({ de: 'Symbolfarbe', en: 'Icon colour' }, {
        options: [
          { value: 'primary', label: { de: 'Hauptfarbe', en: 'Primary' } }, { value: 'info', label: { de: 'Info', en: 'Info' } },
          { value: 'success', label: { de: 'Erfolg', en: 'Success' } }, { value: 'warning', label: { de: 'Warnung', en: 'Warning' } },
          { value: 'error', label: { de: 'Fehler', en: 'Error' } },
        ],
        optional: true,
      }),
      image: f.image({ de: 'Bild', en: 'Image' }, { optional: true }),
      // The image's pixel size, filled from the file (imageSizeProps), so the card keeps its height while the image loads.
      imageWidth: f.number({ de: 'Bildbreite in Pixeln', en: 'Image width in pixels' }, { min: 1, max: 10000, step: 1, optional: true }),
      imageHeight: f.number({ de: 'Bildhöhe in Pixeln', en: 'Image height in pixels' }, { min: 1, max: 10000, step: 1, optional: true }),
      horizontal: f.boolean({ de: 'Bild neben dem Text', en: 'Image beside the text' }, { optional: true }),
      appearance,
    },
    editor: { group: { de: 'Layout', en: 'Layout' }, example: '::card{title="Erste Schritte" href="/" description="In fünf Minuten startklar."}\nMehr dazu auf der Startseite.\n::' },
  },
  'read-more': {
    kind: 'block',
    label: { de: 'Weiterlesen-Link', en: 'Read more link' },
    describe: { de: 'Ein auffälliger Link zu einer weiteren Seite.', en: 'A prominent link to another page.' },
    props: {
      href: href({ de: 'Link', en: 'Link' }, false),
      title: f.text({ de: 'Text', en: 'Text' }, { optional: true, max: 120 }),
      icon,
      appearance,
    },
    editor: { group: { de: 'Text', en: 'Text' }, keywords: ['link', 'weiterlesen', 'verweis', 'weiter', 'read more', 'more', 'next'], example: '::read-more{href="/" title="Zur Startseite"}\nWie alles anfängt.\n::' },
  },
  'inline-toc': {
    kind: 'block',
    label: { de: 'Inhaltsverzeichnis', en: 'Table of contents' },
    describe: {
      de: 'Listet die Überschriften dieser Seite als Links auf.',
      en: 'Lists the headings of this page as links.',
    },
    props: {
      title: f.text({ de: 'Überschrift', en: 'Heading' }, { optional: true, max: 60 }),
      depth: f.number({ de: 'Tiefe', en: 'Depth' }, { min: 2, max: 4, step: 1, optional: true }),
      open: f.boolean({ de: 'Geöffnet', en: 'Open' }, { optional: true }),
      appearance,
    },
    editor: { group: { de: 'Text', en: 'Text' }, example: '::inline-toc{title="Auf dieser Seite" depth="3"}\n::' },
  },
})
