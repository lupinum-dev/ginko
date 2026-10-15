// Restaurant bricks with the owner's quick tasks. Labels and prefilled texts come in German and English. The site keeps
// the texts of its own locales when its main locale is `de` or `en` (exactly: `de-CH` does not count); otherwise it
// starts without the prefilled texts (`serializeSchema`).
import { collection, f, single, type BrickSource, type ChoiceOption, type Locale, type RouteTemplate, type Task } from '@lupinum/ginko'
import { gallery } from '@lupinum/ginko/basics'
import { eventsBrick, hourPlansBrick, hoursBrick, noticesBrick, weekdays, type ChoicesField, type DateField, type HoursTexts, type ListField, type WeekRow } from '@lupinum/ginko/internal'
import { allergenNames } from './names.ts'

/** Allergen codes on dishes: the EU list of 14, none at all (the field is left out), or your own list. */
export type AllergenSet = 'EU' | 'none' | readonly ChoiceOption[]

/** A schema label in both languages. The editor sees the one for their language, and a site in another language falls back to English. */
const both = (de: string, en: string) => ({ de, en })

export { weekdays }

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
const weekDefault: WeekRow[] = weekdays.map((d) => ({
  _id: `wk${d.value}000000`,
  day: d.value,
  closed: d.value === 'mo',
  ...(d.value === 'mo' ? {} : { from1: '11:30', to1: '14:00', from2: '17:30', to2: '22:00' }),
}))

const lunchPlaceholder = { de: 'Wird noch bekannt gegeben', en: 'To be announced' } as const

const soldOutText = { de: 'Heute sind wir ausgebucht.', en: 'We are fully booked today.' }

const lunchDefault = weekdays.slice(0, 5).map((d) => ({ _id: `ld${d.value}000000`, day: d.value, dish: lunchPlaceholder }))

// The restaurant wording of the hours bricks (the basics are neutral): pinned here, because labels and hints are part
// of every gastro site's stored schema.
const hoursTexts: HoursTexts = {
  hours: both('Öffnungszeiten', 'Opening hours'),
  week: both('Wochenplan', 'Weekly hours'), day: both('Tag', 'Day'), closed: both('Ruhetag', 'Closed all day'),
  opens: both('Öffnet um', 'Opens at'), closes: both('Schließt um', 'Closes at'), opensAgain: both('Öffnet wieder um', 'Opens again at'),
  opensAgainHint: both('Nur wenn du untertags eine Pause machst.', 'Only if you close for a break during the day.'),
  closesAgain: both('Schließt wieder um', 'Closes again at'),
  exceptions: both('Betriebsurlaub und Ausnahmen', 'Holiday closures and exceptions'), exception: both('Ausnahme', 'Exception'), dates: both('Zeitraum', 'Dates'),
  reason: both('Grund', 'Reason'),
  reasonHint: both('Kurz, z. B. „Betriebsurlaub“ oder „Hochzeit“. Steht so auf der Website.', 'Keep it short, e.g. “Annual holiday” or “Wedding party”. Shown like this on the website.'),
  exceptionClosed: both('Geschlossen', 'Closed'),
  closedOn: both('Geschlossen am', 'Closed on'),
  closedOnHint: both('Ein einzelner Tag. Für mehrere Tage nimm „Betriebsurlaub und Ausnahmen“.', 'A single day. For several days, use “Holiday closure and exceptions”.'),
  closedNote: both('Grund für die Gäste', 'Reason for guests'),
  closedNoteHint: both('Steht auf der Website, z. B. „Wegen eines Wasserrohrbruchs“.', 'Shown on the website, e.g. “Because of a burst water pipe”.'),
  noticeDays: both('Schließungen ankündigen (Tage vorher)', 'Announce closures (days ahead)'),
  noticeDaysHint: both('So viele Tage vorher kündigt die Website eine Schließung oder einen geschlossenen Feiertag an.', 'How many days ahead the website announces a closure or a public holiday when you are closed.'),
  holidays: both('An Feiertagen', 'On public holidays'),
  holidaySunday: both('wie am Sonntag', 'same as Sunday'), holidayClosed: both('geschlossen', 'closed'), holidayNormal: both('normale Zeiten des Wochentags', 'the weekday’s usual hours'),
  holidaysHint: both(
    'Gilt für alle gesetzlichen Feiertage. „Wie am Sonntag“ nimmt die Sonntagszeiten, die an dem Tag gelten. Für andere Zeiten an einem einzelnen Feiertag, z. B. am 26.12., trag unter „Betriebsurlaub und Ausnahmen“ eine Ausnahme ein.',
    'Applies to every public holiday. “Same as Sunday” uses the Sunday hours that apply on that day. For other hours on a single holiday, such as 26 December, add an exception under “Holiday closure and exceptions”.',
  ),
  closedToday: both('Heute geschlossen', 'Closed today'), holidaySetting: both('Öffnungszeiten an Feiertagen', 'Opening hours on public holidays'),
  plans: both('Öffnungszeiten ab Datum', 'Opening hours from a date'), planName: both('Name', 'Name'), planFrom: both('Gilt ab', 'Applies from'),
  planTo: both('Gilt bis', 'Applies until'), yearly: both('Jedes Jahr wiederholen', 'Repeat every year'),
  planAdd: both('Neue Öffnungszeiten ab …', 'New opening hours from …'), planEdit: both('Öffnungszeiten ab Datum bearbeiten', 'Edit hours from a date'),
  planRemove: both('Öffnungszeiten ab Datum entfernen', 'Remove hours from a date'),
}

/**
 * Weekly hours, closures and the owner's choice for public holidays (the basics `hours` with restaurant wording and
 * times). Which holidays count is `calendar` or `country` in the context of the hours rules (`hoursOn`, `todayState`);
 * neither means Austria.
 */
export function hours(opts: GastroOptions = {}) {
  return hoursBrick(hoursTexts, weekDefault, opts)
}

/** Own weekly hours for a date range: a season (yearly) or "new hours from a date" (open end). */
export function hourPlans(opts: GastroOptions = {}) {
  return hourPlansBrick(hoursTexts, weekDefault, opts)
}

/** The basics notices with "Fully booked today" as the first quick task. */
export function notices(opts: GastroOptions = {}) {
  return noticesBrick(opts, [
    // The weekly job first: it becomes the main quick task.
    { id: 'soldOut', label: both('Heute ausgebucht', 'Fully booked today'), kind: 'create', prefill: { text: soldOutText, until: '@today' } },
  ])
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
      { id: 'add', label: both('Gericht hinzufügen', 'Add a dish'), kind: 'create' },
      { id: 'remove', label: both('Gericht entfernen', 'Remove a dish'), kind: 'remove' },
    ],
  })
}

/** The basics events as in 0.4: no end time, place or online address, and a reservation link. */
export function events(opts: GastroOptions & { route: Record<Locale, RouteTemplate> }) {
  return eventsBrick(opts, both('Reservierungs-Link', 'Booking link'), {})
}

/** The basics gallery. */
export { gallery }
