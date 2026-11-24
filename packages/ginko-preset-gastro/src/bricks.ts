// Restaurant bricks with the owner's quick tasks, as patterns: each function returns a brick of the written form, so a
// site changes it with `extend` of '@lupinum/ginko' (`extend(menu(), { preview: 'menu' })`). Where a brick lives and
// the address of an event are in the site file (`studio`, `entries`). Each brick is made from a private builder of the
// stored form and turned into the written form by `defOf`, so its stored model is exactly what it was.
// Labels and prefilled texts come in German and English. The site keeps the texts of its own locales when its main
// locale is `de` or `en` (exactly: `de-CH` does not count); otherwise it starts without the prefilled texts.
import { collection, defOf, f, single, type ChoiceOption, type Task } from '@lupinum/ginko/internal'
import { gallery } from '@lupinum/ginko/patterns'
import { DAY_KEYS, eventsBrick, hourPlansBrick, hoursBrick, noticesBrick, type ChoicesField, type DateField, type HoursTexts, type RowsField, type WeekDefault } from '@lupinum/ginko/internal'
import { allergenNames } from './names.ts'

/** Allergen codes on dishes: the EU list of 14, none at all (the field is left out), or your own list. */
export type AllergenSet = 'EU' | 'none' | readonly ChoiceOption[]

/** A schema label in both languages. The editor sees the one for their language, and a site in another language falls back to English. */
const both = (de: string, en: string) => ({ de, en })

// The 14 EU allergens (LMIV) with the letter codes used in Austria.
export const allergensEU: readonly ChoiceOption[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'L', 'M', 'N', 'O', 'P', 'R'].map((code) => ({
  value: code,
  label: both(`${code} ${allergenNames.de[code]}`, `${code} ${allergenNames.en[code]}`),
}))

/** The categories of `menu()`, in the order of a menu. A site groups its dishes by these values. */
export const menuCategories = ['starters', 'soups', 'mains', 'desserts', 'drinks'] as const
export type MenuCategory = (typeof menuCategories)[number]
const categoryLabels: Record<MenuCategory, { de: string, en: string }> = {
  starters: both('Vorspeisen', 'Starters'), soups: both('Suppen', 'Soups'), mains: both('Hauptspeisen', 'Mains'),
  desserts: both('Nachspeisen', 'Desserts'), drinks: both('Getränke', 'Drinks'),
}

/** The `allergens` field type: present unless the set is `'none'`. */
type AllergenFields<A extends AllergenSet> = A extends 'none' ? {} : { allergens: ChoicesField<string> }

/** The allergen choices for a set, or `undefined` when the field is left out. */
function allergenChoices(set: AllergenSet | undefined): readonly ChoiceOption[] | undefined {
  if (set === 'none') return undefined
  if (set === undefined || set === 'EU') return allergensEU
  return set
}

/** Closed on Monday; 11:30–14:00 and 17:30–22:00 on the other days. */
const weekDefault = Object.fromEntries(DAY_KEYS.map((day) => [day, day === 'mo' ? { closed: true } : { closed: false, from1: '11:30', to1: '14:00', from2: '17:30', to2: '22:00' }])) as WeekDefault

const lunchPlaceholder = { de: 'Wird noch bekannt gegeben', en: 'To be announced' } as const

/** True for the dish text a fresh site's lunch week starts with, in any language: such a day has no real dish, so no allergens to show. */
export function isLunchPlaceholder(dish: unknown): boolean {
  const placeholders: string[] = Object.values(lunchPlaceholder)
  return typeof dish === 'string' && placeholders.includes(dish)
}

const soldOutText = { de: 'Heute sind wir ausgebucht.', en: 'We are fully booked today.' }

// The restaurant wording of the hours bricks (the basics are neutral): pinned here, because labels and hints are part
// of every gastro site's stored schema.
const hoursTexts: HoursTexts = {
  hours: both('Öffnungszeiten', 'Opening hours'),
  week: both('Wochenplan', 'Weekly hours'), closed: both('Ruhetag', 'Closed all day'),
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
 * Weekly hours, closures and the owner's choice for public holidays (the `hours` pattern with restaurant wording and
 * times). Which holidays count is `calendar` or `country` in the context of the hours rules (`hoursOn`, `todayState`);
 * neither means Austria. `plans`: the key of the site's `hourPlans()`, so the Studio's line for today follows them.
 */
export function hours(opts: { plans?: string } = {}) {
  return defOf(hoursBrick(hoursTexts, weekDefault, opts))
}

/** Own weekly hours for a date range: a season (yearly) or "new hours from a date" (open end). */
export function hourPlans() {
  return defOf(hourPlansBrick(hoursTexts, weekDefault, {}), { item: both('Zeitraum', 'a period') })
}

/** The `notices` pattern with "Fully booked today" as the first quick task. */
export function notices() {
  return defOf(storedNotices(), { item: both('Hinweis', 'a notice') })
}

function storedNotices() {
  return noticesBrick({}, [
    // The weekly job first: it becomes the main quick task.
    { id: 'soldOut', label: both('Heute ausgebucht', 'Fully booked today'), kind: 'create', prefill: { text: soldOutText, until: '@today' } },
  ])
}

/** The list of lunch days; `allergens` left out when the set is `'none'`. */
function lunchDays<A extends AllergenSet>(allergens: A | undefined) {
  const choices = allergenChoices(allergens)
  // A day starts with the placeholder dish and no allergens: the columns' defaults fill every workday of the site.
  const columns = {
    dish: f.text(both('Gericht', 'Dish'), { max: 200, default: lunchPlaceholder }),
    price: f.money(both('Preis', 'Price'), { optional: true }),
  }
  // `allergens` exists only when the set is not 'none', which the type cannot see here.
  return (choices
    ? f.rows(both('Tage', 'Days'), { rows: 'workdays', fields: { ...columns, allergens: f.choices(both('Allergene', 'Allergens'), { options: choices, askAgainWhen: 'dish', default: [] }) } })
    : f.rows(both('Tage', 'Days'), { rows: 'workdays', fields: columns })) as RowsField<typeof columns & AllergenFields<A>, 'workdays'>
}

/**
 * This week's lunch. `weekOf`: the start value of the week on the platform (a Monday). `needsApproval`: the week a
 * staff member enters waits for the owner's yes.
 */
export function lunch<const A extends AllergenSet = 'EU'>(opts: { weekOf?: string; allergens?: A; needsApproval?: boolean } = {}) {
  return defOf(storedLunch(opts))
}

function storedLunch<const A extends AllergenSet>(opts: { weekOf?: string; allergens?: A; needsApproval?: boolean }) {
  return single({
    label: both('Mittagsmenü', 'Lunch menu'),
    fields: {
      weekOf: f.date(both('Woche ab', 'Week starting'), opts.weekOf ? { default: opts.weekOf } : {}),
      days: lunchDays(opts.allergens),
      note: f.text(both('Hinweis', 'Note'), { max: 200, optional: true }),
      // Many houses also hand out the week as a PDF; replacing it in the Files library updates every link.
      pdf: f.file(both('Mittagsmenü als PDF', 'Lunch menu as PDF'), { accept: ['pdf'], maxBytes: 5 * 1024 * 1024, optional: true }),
    },
    tasks: [
      { id: 'lunchWeek', label: both('Mittagsmenü dieser Woche', 'This week’s lunch menu'), kind: 'edit', fields: ['weekOf', 'days', 'note'], prefill: { weekOf: '@workWeek' }, ...(opts.needsApproval ? { needsApproval: true } : {}) },
    ],
  })
}

/** Lunch weeks planned ahead (at most 3). Nested lists are not allowed, so planned weeks are entries, not a list on `lunch`. A week shows from its first day (see `lunchWeekOn`). */
/** `lunchBrick` is the key the site gives the `lunch()` brick; a planned week there counts as entered for it. */
export function lunchPlans<const A extends AllergenSet = 'EU'>(opts: { allergens?: A; lunchBrick?: string } = {}) {
  return defOf(storedLunchPlans(opts), { item: both('Woche', 'a week') })
}

function storedLunchPlans<const A extends AllergenSet>(opts: { allergens?: A; lunchBrick?: string }) {
  const lunchBrick = opts.lunchBrick ?? 'lunch'
  return collection({
    label: both('Mittagsmenü vorausplanen', 'Plan the lunch menu ahead'),
    listing: { title: 'weekOf' },
    untranslated: 'fallback',
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

/** The dishes of the menu, with allergens (`allergens`: the EU list, `'none'` or your own), a planned price and "sold out today". */
export function menu<const A extends AllergenSet = 'EU'>(opts: { allergens?: A } = {}) {
  return defOf(storedMenu(opts), { item: both('Gericht', 'a dish') })
}

function storedMenu<const A extends AllergenSet>(opts: { allergens?: A }) {
  const choices = allergenChoices(opts.allergens)
  const fields = {
    category: f.choice(both('Kategorie', 'Category'), {
      options: menuCategories.map((value) => ({ value, label: categoryLabels[value] })),
    }),
    name: f.text(both('Name', 'Name'), { max: 120 }),
    description: f.longtext(both('Beschreibung', 'Description'), { max: 500, optional: true }),
    price: f.money(both('Preis', 'Price')),
    ...(choices ? { allergens: f.choices(both('Allergene', 'Allergens'), { options: choices, askAgainWhen: 'name' }) } : {}) as AllergenFields<A>,
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
    listing: { title: 'name', detail: 'price', group: 'category' },
    untranslated: 'fallback', // a dish without an English name is shown in German
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

/**
 * The events pattern as in 0.4: no end time, place or online address, and a reservation link. The page of an event is
 * a line in the site's `entries`: `events: '/events/[slug]'`.
 */
export function events() {
  return defOf(eventsBrick({}, both('Reservierungs-Link', 'Booking link'), {}), { item: both('Veranstaltung', 'an event') })
}

/** The `gallery` pattern. */
export { gallery }
