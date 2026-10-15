// Restaurant bricks with the owner's quick tasks. Labels and prefilled texts come in German and English. The site keeps
// the texts of its own locales when its main locale is `de` or `en` (exactly: `de-CH` does not count); otherwise it
// starts without the prefilled texts (`serializeSchema`).
import { collection, f, single, type BrickSource, type ChoiceOption, type Locale, type RouteTemplate, type Task } from '@lupinum/ginko'
import type { ChoicesField, DateField, ListField } from '@lupinum/ginko/internal'
import { allergenNames } from './names.ts'

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

const soldOutText = { de: 'Heute sind wir ausgebucht.', en: 'We are fully booked today.' }

const lunchDefault = weekdays.slice(0, 5).map((d) => ({ _id: `ld${d.value}000000`, day: d.value, dish: lunchPlaceholder }))

/** Times only on a day that is not closed (a closed day keeps its stored times). */
const open = { field: 'closed', not: true } as const

/**
 * The two opening periods of a day (the stored limit). Neutral words, not "lunch" and "evening": a winter plan keeps
 * 17:00–21:30 in the first period, and the owner must not read that as lunch.
 */
function timeFields() {
  return {
    from1: f.time(both('Öffnet um', 'Opens at'), { optional: true, showWhen: open }),
    to1: f.time(both('Schließt um', 'Closes at'), { optional: true, showWhen: open }),
    from2: f.time(both('Öffnet wieder um', 'Opens again at'), {
      optional: true, showWhen: open,
      hint: both('Nur wenn du untertags eine Pause machst.', 'Only if you close for a break during the day.'),
    }),
    to2: f.time(both('Schließt wieder um', 'Closes again at'), { optional: true, showWhen: open }),
  }
}

/** One 7-row week, shared by the standard hours and the hour plans. */
function weekField() {
  return f.list(both('Wochenplan', 'Weekly hours'), {
    itemLabel: both('Tag', 'Day'),
    fields: {
      day: f.choice(both('Tag', 'Day'), { options: weekdays }),
      closed: f.boolean(both('Ruhetag', 'Closed all day')),
      ...timeFields(),
    },
    min: 7, max: 7, unique: 'day', default: weekDefault,
  })
}

/** Weekly hours, closures and the owner's choice for public holidays. Which holidays count is `calendar` in the context of the hours rules (`hoursOn`, `todayState`). */
export function hours(opts: GastroOptions = {}) {
  return single({
    label: both('Öffnungszeiten', 'Opening hours'),
    ...sourceOf(opts),
    fields: {
      week: weekField(),
      exceptions: f.list(both('Betriebsurlaub und Ausnahmen', 'Holiday closures and exceptions'), {
        itemLabel: both('Ausnahme', 'Exception'),
        fields: {
          when: f.daterange(both('Zeitraum', 'Dates')),
          reason: f.text(both('Grund', 'Reason'), {
            max: 140,
            hint: both('Kurz, z. B. „Betriebsurlaub“ oder „Hochzeit“. Steht so auf der Website.', 'Keep it short, e.g. “Annual holiday” or “Wedding party”. Shown like this on the website.'),
          }),
          // A new exception is a closure unless the owner says otherwise.
          closed: f.boolean(both('Geschlossen', 'Closed'), { default: true }),
          // Special hours: "Geschlossen" off and times set, e.g. 24.12. from 11:00 to 14:00.
          ...timeFields(),
        },
        max: 20, default: [],
      }),
      // Optional: "Aufheben" in the Studio clears it, and saving it empty lifts the closure.
      closedOn: f.date(both('Geschlossen am', 'Closed on'), {
        optional: true,
        hint: both('Ein einzelner Tag. Für mehrere Tage nimm „Betriebsurlaub und Ausnahmen“.', 'A single day. For several days, use “Holiday closure and exceptions”.'),
      }),
      closedNote: f.text(both('Grund für die Gäste', 'Reason for guests'), {
        max: 140, optional: true,
        hint: both('Steht auf der Website, z. B. „Wegen eines Wasserrohrbruchs“.', 'Shown on the website, e.g. “Because of a burst water pipe”.'),
      }),
      holidayNoticeDays: f.number(both('Schließungen ankündigen (Tage vorher)', 'Announce closures (days ahead)'), {
        min: 0, max: 60, step: 1, default: 14,
        hint: both('So viele Tage vorher kündigt die Website eine Schließung oder einen geschlossenen Feiertag an.', 'How many days ahead the website announces a closure or a public holiday when you are closed.'),
      }),
      // The holiday calendar is code (`calendar` in the hours context), so the hint says what the choice covers and
      // where a single holiday gets other hours.
      holidays: f.choice(both('An Feiertagen', 'On public holidays'), {
        options: [
          { value: 'sunday', label: both('wie am Sonntag', 'same as Sunday') }, { value: 'closed', label: both('geschlossen', 'closed') },
          { value: 'normal', label: both('normale Zeiten des Wochentags', 'the weekday’s usual hours') },
        ],
        optional: true, default: 'sunday',
        hint: both(
          'Gilt für alle gesetzlichen Feiertage. „Wie am Sonntag“ nimmt die Sonntagszeiten, die an dem Tag gelten. Für andere Zeiten an einem einzelnen Feiertag, z. B. am 26.12., trag unter „Betriebsurlaub und Ausnahmen“ eine Ausnahme ein.',
          'Applies to every public holiday. “Same as Sunday” uses the Sunday hours that apply on that day. For other hours on a single holiday, such as 26 December, add an exception under “Holiday closure and exceptions”.',
        ),
      }),
    },
    tasks: [
      { id: 'closedToday', label: both('Heute geschlossen', 'Closed today'), kind: 'edit', fields: ['closedOn', 'closedNote'], prefill: { closedOn: '@today' } },
      // The lead time sits under the list, so the owner sees when guests first read about a closure.
      { id: 'holiday', label: both('Betriebsurlaub und Ausnahmen', 'Holiday closures and exceptions'), kind: 'edit', fields: ['exceptions', 'holidayNoticeDays'] },
      { id: 'holidaySetting', label: both('Öffnungszeiten an Feiertagen', 'Opening hours on public holidays'), kind: 'edit', fields: ['holidays'] },
    ],
  })
}

/** Own weekly hours for a date range: a season (yearly) or "new hours from a date" (open end). */
export function hourPlans(opts: GastroOptions = {}) {
  return collection({
    label: both('Öffnungszeiten ab Datum', 'Opening hours from a date'),
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
      until: f.date(both('Gilt bis', 'Shown until'), {
        optional: true,
        hint: both('Leer lassen, wenn der Hinweis bleiben soll, bis du ihn entfernst.', 'Leave empty to keep the notice until you remove it.'),
      }),
    },
    max: 5,
    order: 'manual',
    visible: { mode: 'until', field: 'until', deleteExpired: true },
    tasks: [
      // The weekly job first: it becomes the main quick task.
      { id: 'soldOut', label: both('Heute ausgebucht', 'Fully booked today'), kind: 'create', prefill: { text: soldOutText, until: '@today' } },
      { id: 'add', label: both('Hinweis hinzufügen', 'Add a notice'), kind: 'create' },
      { id: 'remove', label: both('Hinweis entfernen', 'Remove a notice'), kind: 'remove' },
    ],
  })
}

/** The list of lunch days; `allergens` left out when the set is `'none'`. */
function lunchDays<A extends AllergenSet>(allergens: A | undefined) {
  const choices = allergenChoices(allergens)
  const columns = {
    day: f.choice(both('Tag', 'Day'), { options: weekdays.slice(0, 5) }),
    dish: f.text(both('Gericht', 'Dish'), { max: 200 }),
    price: f.money(both('Preis', 'Price'), { optional: true }),
  }
  const list = { itemLabel: both('Tag', 'Day'), min: 5, max: 5, unique: 'day' } as const
  // Each branch checks its own default rows; `allergens` exists only when the set is not 'none', which the type cannot see here.
  return (choices
    ? f.list(both('Tage', 'Days'), { ...list, fields: { ...columns, allergens: f.choices(both('Allergene', 'Allergens'), { options: choices }) }, default: lunchDefault.map((row) => ({ ...row, allergens: [] })) })
    : f.list(both('Tage', 'Days'), { ...list, fields: columns, default: lunchDefault })) as ListField<typeof columns & AllergenFields<A>>
}

export function lunch<const A extends AllergenSet = 'EU'>(opts: GastroOptions & { weekOf?: string; allergens?: A } = {}) {
  return single({
    label: both('Mittagsmenü', 'Lunch menu'),
    ...sourceOf(opts),
    fields: {
      weekOf: f.date(both('Woche ab', 'Week starting'), opts.weekOf ? { default: opts.weekOf } : {}),
      days: lunchDays(opts.allergens),
      note: f.text(both('Hinweis', 'Note'), { max: 200, optional: true }),
      // Many houses also hand out the week as a PDF; replacing it in the Files library updates every link.
      pdf: f.file(both('Mittagsmenü als PDF', 'Lunch menu as PDF'), { accept: ['pdf'], maxBytes: 5 * 1024 * 1024, optional: true }),
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
      days: lunchDays(opts.allergens),
      note: f.text(both('Hinweis', 'Note'), { max: 200, optional: true }),
    },
    max: 3,
    order: { field: 'weekOf', dir: 'asc' },
    // A planned week is over on its last day and then removed, so the owner never clears old weeks by hand.
    visible: { mode: 'until', field: 'weekOf', days: 6, deleteExpired: true },
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
  const fields = {
    category: f.choice(both('Kategorie', 'Category'), {
      options: [
        { value: 'starters', label: both('Vorspeisen', 'Starters') }, { value: 'soups', label: both('Suppen', 'Soups') },
        { value: 'mains', label: both('Hauptspeisen', 'Mains') }, { value: 'desserts', label: both('Nachspeisen', 'Desserts') },
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
    // Availability (see `dishOn`) is optional, so dishes stored before it and Markdown files stay valid: a missing
    // `onMenu` means on the menu, a missing `soldOutOn` (below) means not sold out.
    onMenu: f.boolean(both('Auf der Karte', 'On the menu'), {
      optional: true, default: true,
      hint: both('Ausschalten, wenn es das Gericht eine Zeit lang nicht gibt, z. B. nach der Saison. Es bleibt gespeichert, und du kannst es wieder einschalten.', 'Turn this off when the dish is not offered for a while, e.g. after its season. It stays saved, and you can turn it back on.'),
    }),
    // A planned price change: the site shows `nextPrice` from `priceFrom` on (`planned` below, `priceOn`).
    nextPrice: f.money(both('Geplanter Preis', 'Planned price'), {
      optional: true,
      hint: both('Gilt ab dem Datum darunter. Bis dahin bleibt der Preis oben.', 'Applies from the date below. Until then the price above stays.'),
    }),
    priceFrom: f.date(both('Geplanter Preis gilt ab', 'Planned price applies from'), { optional: true }),
    // Sold out on one day only: the next day the dish is back by itself.
    soldOutOn: f.date(both('Aus am', 'Sold out on'), {
      optional: true,
      hint: both('An diesem Tag steht das Gericht auf der Website als „heute aus“. Am nächsten Tag ist es wieder normal da.', 'On that day the website shows the dish as “sold out today”. The next day it is back as usual.'),
    }),
  }
  // The plan sits right under the price in every task that shows the price. `allergens` exists only when the set is
  // not 'none', which the type cannot see here.
  const dishFields = (choices
    ? ['category', 'name', 'description', 'price', 'nextPrice', 'priceFrom', 'allergens', 'veg', 'onMenu']
    : ['category', 'name', 'description', 'price', 'nextPrice', 'priceFrom', 'veg', 'onMenu']) as readonly (keyof typeof fields & string)[]
  // A new dish is on the menu and cannot be sold out yet, so "add" does not ask for `onMenu` and `soldOutOn`; the plan
  // fields wait for "Preis ändern". Same cast as `dishFields`.
  const addFields = (choices
    ? ['category', 'name', 'description', 'price', 'allergens', 'veg']
    : ['category', 'name', 'description', 'price', 'veg']) as readonly (keyof typeof fields & string)[]
  // The allergen set keeps `fields` generic, so the type cannot check a prefill against it (as with `dishFields`).
  // `satisfies` checks the task against its one date field first; the cast only widens it to the generic fields.
  const soldOut = ({
    id: 'soldOut', label: both('Gericht heute aus', 'Dish sold out today'), kind: 'edit', pick: true, fields: ['soldOutOn'], prefill: { soldOutOn: '@today' },
  } satisfies Task<{ soldOutOn: DateField }>) as unknown as Task<typeof fields>
  return collection({
    label: both('Speisekarte', 'Menu'),
    ...sourceOf(opts),
    fields,
    // The platform checks that a plan has both its price and its date, and opens "Preis ändern" on the price in effect.
    planned: { field: 'price', next: 'nextPrice', from: 'priceFrom' },
    max: 150,
    order: 'manual',
    tasks: [
      // The daily job first: it becomes the main quick task.
      soldOut,
      { id: 'edit', label: both('Gericht bearbeiten', 'Edit a dish'), kind: 'edit', pick: true, fields: dishFields },
      // One sheet for the price and its plan, so a new price never hides behind a planned one.
      { id: 'price', label: both('Preis ändern', 'Change a price'), kind: 'edit', pick: true, fields: ['price', 'nextPrice', 'priceFrom'] },
      { id: 'add', label: both('Gericht hinzufügen', 'Add a dish'), kind: 'create', fields: addFields },
      { id: 'remove', label: both('Gericht entfernen', 'Remove a dish'), kind: 'remove' },
    ],
  })
}

export function events(opts: GastroOptions & { route: Record<Locale, RouteTemplate> }) {
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
      // The site shows "Ausgebucht" instead of the booking link. Optional: a missing value means bookable.
      soldOut: f.boolean(both('Ausgebucht', 'Fully booked'), { optional: true }),
    },
    max: 30,
    order: { field: 'when', dir: 'asc' },
    visible: { mode: 'until', field: 'when' },
    route: opts.route,
    tasks: [
      { id: 'add', label: both('Veranstaltung hinzufügen', 'Add an event'), kind: 'create' },
      { id: 'soldOut', label: both('Veranstaltung ausgebucht', 'Event fully booked'), kind: 'edit', pick: true, fields: ['soldOut'] },
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
