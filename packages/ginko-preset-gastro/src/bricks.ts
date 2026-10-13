// Restaurant bricks with the owner's quick tasks. Labels come in German and English; `lang` picks only default content.
import { collection, f, single, type BrickSource, type ChoiceOption, type ChoicesField, type Locale } from '@lupinum/ginko'
import { allergenNames } from './names.ts'
import { calendarOf, type HolidayCalendar, type HolidaysOption } from './holidays.ts'

/** Allergen codes on dishes: the EU list of 14, none at all (the field is left out), or your own list. */
export type AllergenSet = 'EU' | 'none' | readonly ChoiceOption[]

/** A schema label in both languages. The editor sees the one for their language, and a site in another language falls back to English. */
const both = (de: string, en: string) => ({ de, en })

export const weekdays = [
  { value: 'mo', label: both('Montag', 'Monday') }, { value: 'tu', label: both('Dienstag', 'Tuesday') }, { value: 'we', label: both('Mittwoch', 'Wednesday') },
  { value: 'th', label: both('Donnerstag', 'Thursday') }, { value: 'fr', label: both('Freitag', 'Friday') }, { value: 'sa', label: both('Samstag', 'Saturday') },
  { value: 'su', label: both('Sonntag', 'Sunday') },
] as const

// The 14 EU allergens (LMIV) with the letter codes used in Austria.
export const allergensEU: readonly ChoiceOption[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'L', 'M', 'N', 'O', 'P', 'R'].map((code) => ({
  value: code,
  label: both(`${code} ${allergenNames.de[code]}`, `${code} ${allergenNames.en[code]}`),
}))

/** The `allergens` field type: present unless the set is `'none'`. */
type AllergenFields<A extends AllergenSet> = A extends 'none' ? {} : { allergens: ChoicesField<string> }

/** The allergen choices for a set, or `undefined` when the field is left out. */
function allergenChoices(set: AllergenSet | undefined): readonly ChoiceOption[] | undefined {
  if (set === 'none') return undefined
  if (set === undefined || set === 'EU') return allergensEU
  return set
}

/** Options every factory takes. */
export interface GastroOptions {
  /** The site's main language (default `de`). Picks the default content: the lunch placeholder and the "fully booked" text are written for `de` or `en` only; other languages start without them. Labels always come in German and English. */
  lang?: string
  /** Where the content comes from: absent means the Ginko platform (the owner edits it), `'files'` means Markdown in `content/`. */
  source?: BrickSource
}

/** `source` as a brick property, only when set, so a platform brick's schema stays as it was. */
const sourceOf = (opts: GastroOptions) => (opts.source ? { source: opts.source } : {})

// Row IDs in defaults are fixed so every fresh site starts with the same, stable rows.
const weekDefault = weekdays.map((d) => ({
  _id: `wk${d.value}000000`,
  day: d.value,
  closed: d.value === 'mo',
  ...(d.value === 'mo' ? {} : { from1: '11:30', to1: '14:00', from2: '17:30', to2: '22:00' }),
}))

const lunchPlaceholder = { de: 'Wird noch bekannt gegeben', en: 'To be announced' } as const

// Prefilled texts exist only in `de` and `en`; a site in another language starts without them.
const soldOutText = (lang: string | undefined): Record<string, string> => (lang === 'en' ? { text: 'We are fully booked today.' } : lang === undefined || lang === 'de' ? { text: 'Heute sind wir ausgebucht.' } : {})

// The placeholder dish text is keyed by the site's main language, so only `de` and `en` have one.
const lunchDefault = (lang: keyof typeof lunchPlaceholder, withAllergens: boolean) => weekdays.slice(0, 5).map((d) => ({
  _id: `ld${d.value}000000`,
  day: d.value,
  dish: { [lang]: lunchPlaceholder[lang] },
  ...(withAllergens ? { allergens: [] } : {}),
}))

// The holiday calendar chosen in `hours({ calendar })`, for `hoursCalendarOf`. Not part of the schema: a symbol key
// stays out of the serialized schema but survives `{ ...hours(), label: 'Hours' }`.
const calendarKey = Symbol('ginko-preset-gastro.calendar')

/** The holiday calendar a brick from `hours()` was made with (Austria by default). Pass it to `hoursOn` as `ctx.calendar`. */
export function hoursCalendarOf(brick: object): HolidayCalendar {
  // Only `hours()` writes this key.
  return calendarOf((brick as { readonly [calendarKey]?: HolidaysOption })[calendarKey] ?? 'AT')
}

/** Times only on a day that is not closed (a closed day keeps its stored times). */
const open = { field: 'closed', not: true } as const

/** One 7-row week, shared by the standard hours and the hour plans. */
function weekField() {
  return f.list(both('Wochenplan', 'Weekly hours'), {
    itemLabel: both('Tag', 'Day'),
    fields: {
      day: f.choice(both('Tag', 'Day'), { options: weekdays }),
      closed: f.boolean(both('Ruhetag', 'Closed all day')),
      from1: f.time(both('Mittag von', 'Lunch from'), { optional: true, showWhen: open }),
      to1: f.time(both('Mittag bis', 'Lunch until'), { optional: true, showWhen: open }),
      from2: f.time(both('Abend von', 'Evening from'), { optional: true, showWhen: open }),
      to2: f.time(both('Abend bis', 'Evening until'), { optional: true, showWhen: open }),
    },
    min: 7, max: 7, unique: 'day', default: weekDefault,
  })
}

export function hours(opts: GastroOptions & {
  /** Which public holidays count. Code-level config, not a schema field: pass the same value as `ctx.calendar`. Default `'AT'`. (The stored field `holidays` is the owner's setting for those days.) */
  calendar?: HolidaysOption
} = {}) {
  const brick = single({
    label: both('Öffnungszeiten', 'Opening hours'),
    ...sourceOf(opts),
    fields: {
      week: weekField(),
      exceptions: f.list(both('Betriebsurlaub und Ausnahmen', 'Holiday closures and exceptions'), {
        itemLabel: both('Ausnahme', 'Exception'),
        fields: {
          when: f.daterange(both('Zeitraum', 'Dates')),
          reason: f.text(both('Grund', 'Reason'), { max: 140 }),
          // A new exception is a closure unless the owner says otherwise.
          closed: f.boolean(both('Geschlossen', 'Closed'), { default: true }),
          // Special hours: "Geschlossen" off and times set, e.g. 24.12. from 11:00 to 14:00.
          from1: f.time(both('Mittag von', 'Lunch from'), { optional: true, showWhen: open }),
          to1: f.time(both('Mittag bis', 'Lunch until'), { optional: true, showWhen: open }),
          from2: f.time(both('Abend von', 'Evening from'), { optional: true, showWhen: open }),
          to2: f.time(both('Abend bis', 'Evening until'), { optional: true, showWhen: open }),
        },
        max: 20, default: [],
      }),
      closedOn: f.date(both('Heute geschlossen am', 'Closed on'), { optional: true }),
      closedNote: f.text(both('Hinweis zur Schließung', 'Note about the closure'), { max: 140, optional: true }),
      holidayNoticeDays: f.number(both('Hinweis vor Ausnahmen (Tage)', 'Show notice before closures (days)'), { min: 0, max: 60, step: 1, default: 14 }),
      holidays: f.choice(both('An Feiertagen', 'On public holidays'), {
        options: [
          { value: 'sunday', label: both('wie Sonntag', 'same as Sunday') }, { value: 'closed', label: both('geschlossen', 'closed') }, { value: 'normal', label: both('normal', 'normal hours') },
        ],
        optional: true, default: 'sunday',
      }),
    },
    tasks: [
      { id: 'closedToday', label: both('Heute geschlossen', 'Closed today'), kind: 'edit', fields: ['closedOn', 'closedNote'], prefill: { closedOn: '@today' } },
      { id: 'holiday', label: both('Betriebsurlaub und Ausnahmen', 'Holiday closure and exceptions'), kind: 'edit', fields: ['exceptions'] },
      { id: 'holidaySetting', label: both('Öffnungszeiten an Feiertagen', 'Opening hours on public holidays'), kind: 'edit', fields: ['holidays'] },
    ],
  })
  if (opts.calendar) Object.assign(brick, { [calendarKey]: opts.calendar })
  return brick
}

/** Own weekly hours for a date range: a season (yearly) or "new hours from a date" (open end). */
export function hourPlans(opts: GastroOptions = {}) {
  return collection({
    label: both('Öffnungszeiten ab Datum und Saisonen', 'Hours from a date and seasons'),
    ...sourceOf(opts),
    fields: {
      label: f.text(both('Name', 'Name'), { max: 80 }),
      from: f.date(both('Gilt ab', 'Applies from')),
      to: f.date(both('Gilt bis', 'Applies until'), { optional: true }),
      yearly: f.boolean(both('Jedes Jahr wiederholen', 'Repeat every year'), { default: false }),
      week: weekField(),
    },
    max: 12,
    order: { field: 'from', dir: 'asc' },
    tasks: [
      { id: 'add', label: both('Neue Öffnungszeiten ab …', 'New opening hours from …'), kind: 'create' },
      { id: 'edit', label: both('Öffnungszeiten ab Datum bearbeiten', 'Edit hours from a date'), kind: 'edit', pick: true, fields: ['label', 'from', 'to', 'yearly', 'week'] },
      { id: 'remove', label: both('Öffnungszeiten ab Datum entfernen', 'Remove hours from a date'), kind: 'remove' },
    ],
  })
}

export function notices(opts: GastroOptions = {}) {
  return collection({
    label: both('Hinweise', 'Notices'),
    ...sourceOf(opts),
    fields: {
      text: f.text(both('Text', 'Text'), { max: 140 }),
      until: f.date(both('Gilt bis', 'Shown until'), { optional: true }),
    },
    max: 5,
    order: 'manual',
    visible: { mode: 'active', field: 'until' },
    autoRemoveExpired: true,
    tasks: [
      // The weekly job first: it becomes the main quick task.
      { id: 'soldOut', label: both('Heute ausgebucht', 'Fully booked today'), kind: 'create', prefill: { ...soldOutText(opts.lang), until: '@today' } },
      { id: 'add', label: both('Hinweis hinzufügen', 'Add a notice'), kind: 'create' },
      { id: 'remove', label: both('Hinweis entfernen', 'Remove a notice'), kind: 'remove' },
    ],
  })
}

/** The list of lunch days; `allergens` left out when the set is `'none'`. */
function lunchDays<A extends AllergenSet>(lang: string | undefined, allergens: A | undefined) {
  const choices = allergenChoices(allergens)
  const placeholder = lang === undefined ? 'de' : lang
  const isPlaceholderLang = (l: string): l is keyof typeof lunchPlaceholder => l === 'de' || l === 'en'
  return f.list(both('Tage', 'Days'), {
    itemLabel: both('Tag', 'Day'),
    fields: {
      day: f.choice(both('Tag', 'Day'), { options: weekdays.slice(0, 5) }),
      dish: f.text(both('Gericht', 'Dish'), { max: 200 }),
      price: f.money(both('Preis', 'Price'), { optional: true }),
      ...(choices ? { allergens: f.choices(both('Allergene', 'Allergens'), { options: choices }) } : {}) as AllergenFields<A>,
    },
    min: 5, max: 5, unique: 'day',
      ...(isPlaceholderLang(placeholder) ? { default: lunchDefault(placeholder, !!choices) } : {}),
  })
}

export function lunch<const A extends AllergenSet = 'EU'>(opts: GastroOptions & { weekOf?: string; allergens?: A } = {}) {
  return single({
    label: both('Mittagsmenü', 'Lunch menu'),
    ...sourceOf(opts),
    fields: {
      weekOf: f.date(both('Woche ab', 'Week starting'), opts.weekOf ? { default: opts.weekOf } : {}),
      days: lunchDays(opts.lang, opts.allergens),
      note: f.text(both('Hinweis', 'Note'), { max: 200, optional: true }),
      // Many houses also hand out the week as a PDF; replacing it in the Files library updates every link.
      pdf: f.file(both('Mittagsmenü als PDF', 'Lunch menu as PDF'), { accept: ['pdf'], maxSize: 5 * 1024 * 1024, optional: true }),
    },
    tasks: [
      { id: 'lunchWeek', label: both('Mittagsmenü dieser Woche', 'This week’s lunch menu'), kind: 'edit', fields: ['weekOf', 'days', 'note'], prefill: { weekOf: '@workWeek' } },
    ],
  })
}

/** Lunch weeks planned ahead (at most 3). Nested lists are not allowed, so planned weeks are entries, not a list on `lunch`. A week shows from its first day (see `lunchWeekOn`). */
/** `lunchBrick` is the key the site gives the `lunch()` brick; a planned week there counts as entered for it. */
export function lunchPlans<const A extends AllergenSet = 'EU'>(opts: GastroOptions & { allergens?: A; lunchBrick?: string } = {}) {
  const lunchBrick = opts.lunchBrick ?? 'lunch'
  return collection({
    label: both('Mittagsmenü vorausplanen', 'Plan the lunch menu ahead'),
    ...sourceOf(opts),
    fields: {
      weekOf: f.date(both('Woche ab', 'Week starting')),
      days: lunchDays(opts.lang, opts.allergens),
      note: f.text(both('Hinweis', 'Note'), { max: 200, optional: true }),
    },
    max: 3,
    order: { field: 'weekOf', dir: 'asc' },
    // A planned week is over on its last day and then removed, so the owner never clears old weeks by hand.
    visible: { mode: 'active', field: 'weekOf', days: 6 },
    autoRemoveExpired: true,
    plans: { brick: lunchBrick, field: 'weekOf' },
    tasks: [
      { id: 'planNext', label: both('Nächste Woche planen', 'Plan next week'), kind: 'create', prefill: { weekOf: '@nextWorkWeek' } },
      { id: 'edit', label: both('Geplante Woche bearbeiten', 'Edit a planned week'), kind: 'edit', pick: true, fields: ['weekOf', 'days', 'note'] },
      { id: 'remove', label: both('Geplante Woche entfernen', 'Remove a planned week'), kind: 'remove' },
    ],
  })
}

export function menu<const A extends AllergenSet = 'EU'>(opts: GastroOptions & { allergens?: A } = {}) {
  const choices = allergenChoices(opts.allergens)
  const dishFields = choices ? ['category', 'name', 'description', 'price', 'allergens', 'veg'] : ['category', 'name', 'description', 'price', 'veg']
  return collection({
    label: both('Speisekarte', 'Menu'),
    ...sourceOf(opts),
    fields: {
      category: f.choice(both('Kategorie', 'Category'), {
        options: [
          { value: 'starters', label: both('Vorspeisen', 'Starters') }, { value: 'soups', label: both('Suppen', 'Soups') },
          { value: 'mains', label: both('Hauptspeisen', 'Mains') }, { value: 'desserts', label: both('Desserts', 'Desserts') },
          { value: 'drinks', label: both('Getränke', 'Drinks') },
        ],
      }),
      name: f.text(both('Name', 'Name'), { max: 120 }),
      description: f.longtext(both('Beschreibung', 'Description'), { max: 500, optional: true }),
      price: f.money(both('Preis', 'Price')),
      ...(choices ? { allergens: f.choices(both('Allergene', 'Allergens'), { options: choices }) } : {}) as AllergenFields<A>,
      veg: f.choice(both('Vegetarisch', 'Vegetarian'), {
        options: [
          { value: 'none', label: both('nicht vegetarisch', 'not vegetarian') }, { value: 'vegetarian', label: both('vegetarisch', 'vegetarian') }, { value: 'vegan', label: both('vegan', 'vegan') },
        ],
      }),
      // A planned price change: the site shows `nextPrice` from `priceFrom` on (see `priceOn`).
      nextPrice: f.money(both('Neuer Preis', 'New price'), { optional: true }),
      priceFrom: f.date(both('Neuer Preis gilt ab', 'New price applies from'), { optional: true }),
    },
    max: 150,
    order: 'manual',
    tasks: [
      { id: 'edit', label: both('Gericht bearbeiten', 'Edit a dish'), kind: 'edit', pick: true, fields: dishFields },
      { id: 'price', label: both('Preis ändern', 'Change a price'), kind: 'edit', pick: true, fields: ['price'] },
      { id: 'priceFrom', label: both('Preis ab …', 'Price from …'), kind: 'edit', pick: true, fields: ['nextPrice', 'priceFrom'] },
      { id: 'add', label: both('Gericht hinzufügen', 'Add a dish'), kind: 'create' },
      { id: 'remove', label: both('Gericht entfernen', 'Remove a dish'), kind: 'remove' },
    ],
  })
}

export function events(opts: GastroOptions & { route: Partial<Record<Locale, string>> }) {
  return collection({
    label: both('Veranstaltungen', 'Events'),
    ...sourceOf(opts),
    fields: {
      title: f.text(both('Titel', 'Title'), { max: 120 }),
      slug: f.slug(both('Adresse', 'Web address'), { from: 'title' }),
      when: f.daterange(both('Wann', 'When')),
      // The clock time of the first day. `when` stays the order and visibility field.
      start: f.time(both('Beginn', 'Starts at'), { optional: true }),
      description: f.markdown(both('Beschreibung', 'Description'), { profile: 'basic', max: 5000 }),
      price: f.money(both('Preis', 'Price'), { optional: true }),
      booking: f.text(both('Reservierungs-Link', 'Booking link'), { format: 'url', optional: true }),
      image: f.image(both('Bild', 'Image'), { optional: true }),
    },
    max: 30,
    order: { field: 'when', dir: 'asc' },
    visible: { mode: 'upcoming', field: 'when' },
    route: opts.route,
    tasks: [
      { id: 'add', label: both('Veranstaltung hinzufügen', 'Add an event'), kind: 'create' },
      { id: 'remove', label: both('Veranstaltung entfernen', 'Remove an event'), kind: 'remove' },
    ],
  })
}

export function gallery(opts: GastroOptions = {}) {
  return single({
    label: both('Galerie', 'Gallery'),
    ...sourceOf(opts),
    fields: {
      images: f.list(both('Bilder', 'Images'), { itemLabel: both('Bild', 'Image'), fields: { image: f.image(both('Bild', 'Image')) }, max: 24, default: [] }),
    },
    tasks: [{ id: 'edit', label: both('Fotos bearbeiten', 'Edit photos'), kind: 'edit', fields: ['images'] }],
  })
}
