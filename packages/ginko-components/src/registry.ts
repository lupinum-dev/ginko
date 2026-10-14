// The component registry of the editorial Markdown components: pure data, no Vue, so
// `ginko.config.ts` can load it in Node (`import { components } from '@lupinum/ginko-components/registry'`).
// The Vue side is in `runtime/components`; the tag names here are the keys of that map.
import { f } from '@lupinum/ginko'
import { defineComponents } from '@lupinum/ginko/internal'
import { appearance, calloutIcon, iconifyIcon, title } from './fields.ts'
import { apiComponents } from './registry-api.ts'
import { codeComponents } from './registry-code.ts'
import { interactiveComponents } from './registry-interactive.ts'
import { learnComponents } from './registry-learn.ts'
import { mediaComponents } from './registry-media.ts'

const CALLOUT_TYPES = [
  { value: 'note', label: { de: 'Notiz', en: 'Note' } },
  { value: 'info', label: { de: 'Information', en: 'Information' } },
  { value: 'warning', label: { de: 'Warnung', en: 'Warning' } },
  { value: 'error', label: { de: 'Fehler', en: 'Error' } },
  { value: 'success', label: { de: 'Erfolg', en: 'Success' } },
  { value: 'idea', label: { de: 'Tipp', en: 'Tip' } },
] as const

const background = f.choice({ de: 'Hintergrund', en: 'Background' }, {
  options: [
    { value: 'none', label: { de: 'Ohne', en: 'None' } }, { value: 'muted', label: { de: 'Grau', en: 'Gray' } },
    { value: 'tint', label: { de: 'Getönt', en: 'Tinted' } },
  ],
  optional: true, default: 'none',
})
const align = f.choice({ de: 'Ausrichtung', en: 'Alignment' }, {
  options: [
    { value: 'start', label: { de: 'Oben', en: 'Top' } }, { value: 'center', label: { de: 'Mitte', en: 'Middle' } },
    { value: 'end', label: { de: 'Unten', en: 'Bottom' } },
  ],
  optional: true,
})
const frame = f.choice({ de: 'Rahmen', en: 'Frame' }, {
  options: [
    { value: 'none', label: { de: 'Ohne', en: 'None' } }, { value: 'card', label: { de: 'Karte', en: 'Card' } },
    { value: 'border', label: { de: 'Rahmen', en: 'Border' } },
    { value: 'border-dashed', label: { de: 'Rahmen gestrichelt', en: 'Dashed border' } },
    { value: 'outline', label: { de: 'Kontur', en: 'Outline' } },
    { value: 'outline-dashed', label: { de: 'Kontur gestrichelt', en: 'Dashed outline' } },
  ],
  optional: true, default: 'none',
})

// The short forms of `callout` stay valid in existing texts, but are not offered when inserting (`hidden`): the
// editor shows one "Hinweisbox" with the field "Art". Choosing an Art on a short form turns it into `callout`
// (`aliasOf`: the tag, the prop and the value the short form stands for).
const notice = (label: { de: string; en: string }, type: (typeof CALLOUT_TYPES)[number]['value'], example: string) => ({
  kind: 'block' as const,
  label,
  describe: {
    de: `Ein Hinweis der Art „${label.de}“, die Kurzform der Hinweisbox.`,
    en: `A note of the type “${label.en}”, the short form of the callout box.`,
  },
  props: { title, icon: calloutIcon, appearance },
  editor: { group: { de: 'Hinweise', en: 'Notes' }, example, hidden: true, aliasOf: { tag: 'callout', prop: 'type', value: type } },
})

export const components = defineComponents({
  callout: {
    kind: 'block',
    label: { de: 'Hinweisbox', en: 'Callout box' },
    describe: {
      de: 'Hebt einen Absatz hervor: Information, Tipp, Warnung …',
      en: 'Highlights a paragraph: information, tip, warning …',
    },
    props: {
      type: f.choice({ de: 'Art', en: 'Type' }, { options: CALLOUT_TYPES, optional: true, default: 'info' }),
      title,
      icon: calloutIcon,
      appearance,
    },
    editor: {
      group: { de: 'Hinweise', en: 'Notes' },
      example: '::callout{type="info" title="Gut zu wissen"}\nHier steht der Hinweis.\n::',
      keywords: [
        'hinweis', 'box', 'tipp', 'warnung', 'achtung', 'information', 'info', 'notiz', 'idee', 'fehler', 'erfolg',
        'callout', 'note', 'tip', 'warning', 'alert', 'success', 'error', 'idea',
      ],
    },
  },
  note: notice({ de: 'Notiz', en: 'Note' }, 'note', '::note{title="Notiz"}\nEin kurzer Gedanke am Rand.\n::'),
  info: notice({ de: 'Information', en: 'Information' }, 'info', '::info{title="Gut zu wissen"}\nDie Änderung gilt sofort.\n::'),
  warning: notice({ de: 'Warnung', en: 'Warning' }, 'warning', '::warning{title="Achtung"}\nDas lässt sich nicht rückgängig machen.\n::'),
  error: notice({ de: 'Fehler', en: 'Error' }, 'error', '::error{title="Nicht möglich"}\nDie Datei ist zu groß.\n::'),
  success: notice({ de: 'Erfolg', en: 'Success' }, 'success', '::success{title="Geschafft"}\nDie Seite ist veröffentlicht.\n::'),
  idea: notice({ de: 'Idee', en: 'Idea' }, 'idea', '::idea{title="Tipp"}\nEin Foto macht die Seite lebendiger.\n::'),
  aside: {
    kind: 'block',
    label: { de: 'Randbemerkung', en: 'Aside' },
    describe: {
      de: 'Eine ruhige Anmerkung neben dem Haupttext, mit optionaler Überschrift.',
      en: 'A quiet side note next to the main text, with an optional heading.',
    },
    props: { title: f.text({ de: 'Überschrift', en: 'Heading' }, { optional: true, max: 60 }), appearance },
    editor: { group: { de: 'Text', en: 'Text' }, example: '::aside{title="Hintergrund"}\nDer Verein wurde 1998 gegründet.\n::' },
  },
  excerpt: {
    kind: 'block',
    label: { de: 'Hervorgehobenes Zitat', en: 'Highlighted quote' },
    describe: {
      de: 'Ein hervorgehobenes Zitat oder Textauszug, mit optionaler Quelle.',
      en: 'A highlighted quote or excerpt, with an optional source.',
    },
    props: {
      title: f.text({ de: 'Überschrift', en: 'Heading' }, { optional: true, max: 60 }),
      source: f.text({ de: 'Quelle', en: 'Source' }, { optional: true, max: 120 }),
      size: f.choice({ de: 'Größe', en: 'Size' }, {
        options: [
          { value: 'body', label: { de: 'Fließtext', en: 'Body text' } }, { value: 'display', label: { de: 'Groß', en: 'Large' } },
        ],
        optional: true, default: 'body',
      }),
      appearance,
    },
    editor: { group: { de: 'Text', en: 'Text' }, example: '::excerpt{source="Anna Muster, 2024" size="display"}\nWer pflanzt, glaubt an morgen.\n::' },
  },
  dropcap: {
    kind: 'block',
    label: { de: 'Initiale', en: 'Drop cap' },
    describe: {
      de: 'Der erste Buchstabe des Absatzes wird groß dargestellt.',
      en: 'The first letter of the paragraph is shown large.',
    },
    props: { lines: f.number({ de: 'Zeilen', en: 'Lines' }, { min: 2, max: 4, step: 1, optional: true, default: 2 }) },
    editor: { group: { de: 'Text', en: 'Text' }, example: '::dropcap{lines="3"}\nEs war einmal ein kleiner Garten am Rand der Stadt.\n::' },
  },
  kbd: {
    kind: 'inline',
    label: { de: 'Taste', en: 'Key' },
    describe: { de: 'Zeigt eine Tastatureingabe als Taste.', en: 'Shows a keyboard key.' },
    props: {},
    editor: { group: { de: 'Text', en: 'Text' }, example: 'Drücke :kbd[Strg] + :kbd[S] zum Speichern.' },
  },
  badge: {
    kind: 'inline',
    label: { de: 'Marke', en: 'Badge' },
    describe: {
      de: 'Eine kleine farbige Marke im Text, zum Beispiel „neu“.',
      en: 'A small colored badge in the text, for example “new”.',
    },
    props: { color: f.choice({ de: 'Farbe', en: 'Color' }, {
      options: [
        { value: 'neutral', label: { de: 'Neutral', en: 'Neutral' } }, { value: 'primary', label: { de: 'Hauptfarbe', en: 'Primary' } },
        { value: 'success', label: { de: 'Grün', en: 'Green' } }, { value: 'warning', label: { de: 'Gelb', en: 'Yellow' } },
        { value: 'error', label: { de: 'Rot', en: 'Red' } },
      ],
      optional: true, default: 'neutral',
    }) },
    editor: { group: { de: 'Text', en: 'Text' }, example: 'Die Funktion ist :badge[neu]{color="success"}.' },
  },
  flow: {
    kind: 'block',
    label: { de: 'Textblock', en: 'Text block' },
    describe: {
      de: 'Hält den Text in einer angenehmen Zeilenlänge, auf Wunsch mit Hintergrund.',
      en: 'Keeps the text at a comfortable line length, optionally on a background.',
    },
    props: {
      width: f.choice({ de: 'Breite', en: 'Width' }, {
        options: [
          { value: 'reading', label: { de: 'Lesebreite', en: 'Reading width' } }, { value: 'wide', label: { de: 'Breit', en: 'Wide' } },
        ],
        optional: true, default: 'reading',
      }),
      background,
    },
    editor: { group: { de: 'Layout', en: 'Layout' }, example: '::flow{background="muted"}\nEin längerer Text, der in Lesebreite steht.\n::' },
  },
  layout: {
    kind: 'block',
    label: { de: 'Spalten', en: 'Columns' },
    describe: {
      de: 'Ordnet Spalten nebeneinander an; auf kleinen Bildschirmen stehen sie untereinander.',
      en: 'Puts columns side by side; on small screens they stack.',
    },
    props: {
      frame,
      align,
      gap: f.choice({ de: 'Abstand', en: 'Gap' }, {
        options: [
          { value: 'none', label: { de: 'Keiner', en: 'None' } }, { value: 'sm', label: { de: 'Klein', en: 'Small' } },
          { value: 'md', label: { de: 'Mittel', en: 'Medium' } }, { value: 'lg', label: { de: 'Groß', en: 'Large' } },
        ],
        optional: true, default: 'md',
      }),
      stack: f.choice({ de: 'Untereinander bis', en: 'Stack until' }, {
        options: [
          { value: 'sm', label: { de: 'Klein', en: 'Small' } }, { value: 'md', label: { de: 'Mittel', en: 'Medium' } },
          { value: 'lg', label: { de: 'Groß', en: 'Large' } },
        ],
        optional: true, default: 'md',
      }),
      background,
    },
    children: ['column'],
    editor: { group: { de: 'Layout', en: 'Layout' }, example: ':::layout\n::column\nLinke Spalte\n::\n::column\nRechte Spalte\n::\n:::' },
  },
  column: {
    kind: 'block',
    label: { de: 'Spalte', en: 'Column' },
    describe: { de: 'Eine Spalte innerhalb von „Spalten“.', en: 'A column inside “Columns”.' },
    props: {
      width: f.choice({ de: 'Breite', en: 'Width' }, {
        options: [
          { value: 'xs', label: { de: 'Sehr schmal', en: 'Very narrow' } }, { value: 'sm', label: { de: 'Schmal', en: 'Narrow' } },
          { value: 'md', label: { de: 'Mittel', en: 'Medium' } }, { value: 'lg', label: { de: 'Breit', en: 'Wide' } },
          { value: 'xl', label: { de: 'Sehr breit', en: 'Very wide' } },
        ],
        optional: true, default: 'md',
      }),
      align,
      fit: f.choice({ de: 'Bild', en: 'Image' }, {
        options: [
          { value: 'natural', label: { de: 'Natürlich', en: 'Natural' } }, { value: 'cover', label: { de: 'Füllend', en: 'Fill' } },
          { value: 'contain', label: { de: 'Eingepasst', en: 'Fit' } },
        ],
        optional: true, default: 'natural',
      }),
    },
    parents: ['layout'],
    editor: { group: { de: 'Layout', en: 'Layout' }, example: ':::layout\n::column{width="lg"}\nBreite Spalte\n::\n::column{width="sm"}\nSchmale Spalte\n::\n:::' },
  },
  center: {
    kind: 'block',
    label: { de: 'Zentriert', en: 'Centered' },
    describe: {
      de: 'Zentriert den Inhalt in einer schmalen Spalte, auf Wunsch mit Rahmen.',
      en: 'Centers the content in a narrow column, optionally with a frame.',
    },
    props: {
      width: f.choice({ de: 'Breite', en: 'Width' }, {
        options: [
          { value: 'sm', label: { de: 'Schmal', en: 'Narrow' } }, { value: 'md', label: { de: 'Mittel', en: 'Medium' } },
          { value: 'lg', label: { de: 'Breit', en: 'Wide' } },
        ],
        optional: true, default: 'md',
      }),
      frame,
    },
    editor: { group: { de: 'Layout', en: 'Layout' }, example: '::center{width="sm" frame="card"}\nBis bald!\n::' },
  },
  timeline: {
    kind: 'block',
    label: { de: 'Zeitleiste', en: 'Timeline' },
    describe: {
      de: 'Eine senkrechte Liste von Ereignissen in zeitlicher Reihenfolge.',
      en: 'A vertical list of events in time order.',
    },
    props: {},
    children: ['timeline-item'],
    editor: { group: { de: 'Layout', en: 'Layout' }, example: ':::timeline\n::timeline-item{date="2024" title="Gründung"}\nDer Verein startet.\n::\n::timeline-item{date="2026" title="Neuer Garten" active}\nDie zweite Fläche ist offen.\n::\n:::' },
  },
  'timeline-item': {
    kind: 'block',
    label: { de: 'Ereignis', en: 'Event' },
    describe: {
      de: 'Ein Ereignis in der Zeitleiste, mit Datum, Titel und Text.',
      en: 'An event in the timeline, with date, title and text.',
    },
    props: {
      date: f.text({ de: 'Datum', en: 'Date' }, { optional: true, max: 40 }),
      meta: f.text({ de: 'Etikett', en: 'Tag' }, { optional: true, max: 40, hint: { de: 'Kurzes Wort neben dem Datum, zum Beispiel „Neu“.', en: 'A short word next to the date, for example “New”.' } }),
      title,
      icon: iconifyIcon,
      active: f.boolean({ de: 'Hervorgehoben', en: 'Highlighted' }, { optional: true }),
    },
    parents: ['timeline'],
    editor: { group: { de: 'Layout', en: 'Layout' }, example: ':::timeline\n::timeline-item{date="Mai 2025" meta="Neu" title="Erste Ernte"}\nDie Tomaten sind reif.\n::\n:::' },
  },
  ...interactiveComponents,
  ...codeComponents,
  ...mediaComponents,
  ...learnComponents,
  ...apiComponents,
})
