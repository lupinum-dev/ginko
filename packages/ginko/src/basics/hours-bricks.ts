// Opening hours bricks: the weekly hours with closures and the public-holiday setting (`hours`), and own weeks from a
// date (`hourPlans`). The rules that read them are in hours.ts. Labels in German and English; a site in another
// language falls back to English. Stored names and types are data of the sites: never rename them.
import { f } from '../core/fields.ts'
import { collection, single } from '../core/site.ts'
import type { Label } from '../core/types.ts'
import { sourceOf, type BasicsOptions } from './shared.ts'

export { sourceOf, type BasicsOptions }

/** A schema label in both languages. */
export const both = (de: string, en: string) => ({ de, en })

export const weekdays = [
  { value: 'mo', label: both('Montag', 'Monday') }, { value: 'tu', label: both('Dienstag', 'Tuesday') }, { value: 'we', label: both('Mittwoch', 'Wednesday') },
  { value: 'th', label: both('Donnerstag', 'Thursday') }, { value: 'fr', label: both('Freitag', 'Friday') }, { value: 'sa', label: both('Samstag', 'Saturday') },
  { value: 'su', label: both('Sonntag', 'Sunday') },
] as const

/** One row of the default week. Row IDs are fixed so every fresh site starts with the same, stable rows. */
export interface WeekRow { _id: string; day: (typeof weekdays)[number]['value']; closed: boolean; from1?: string; to1?: string; from2?: string; to2?: string }

/** Monday to Friday 09:00–17:00, closed at the weekend. */
const officeWeek: WeekRow[] = weekdays.map((d) => {
  const closed = d.value === 'sa' || d.value === 'su'
  return { _id: `wk${d.value}000000`, day: d.value, closed, ...(closed ? {} : { from1: '09:00', to1: '17:00' }) }
})

/** Every text of the two hours bricks. A preset pins its own (the gastro preset keeps its restaurant wording). */
export interface HoursTexts {
  hours: Label
  week: Label; day: Label; closed: Label
  opens: Label; closes: Label; opensAgain: Label; opensAgainHint: Label; closesAgain: Label
  exceptions: Label; exception: Label; dates: Label; reason: Label; reasonHint: Label; exceptionClosed: Label
  closedOn: Label; closedOnHint: Label; closedNote: Label; closedNoteHint: Label
  noticeDays: Label; noticeDaysHint: Label
  holidays: Label; holidaySunday: Label; holidayClosed: Label; holidayNormal: Label; holidaysHint: Label
  closedToday: Label; holidaySetting: Label
  plans: Label; planName: Label; planFrom: Label; planTo: Label; yearly: Label; planAdd: Label; planEdit: Label; planRemove: Label
}

const neutral: HoursTexts = {
  hours: both('Öffnungszeiten', 'Opening hours'),
  week: both('Wochenplan', 'Weekly hours'), day: both('Tag', 'Day'), closed: both('Ganztägig geschlossen', 'Closed all day'),
  opens: both('Öffnet um', 'Opens at'), closes: both('Schließt um', 'Closes at'), opensAgain: both('Öffnet wieder um', 'Opens again at'),
  opensAgainHint: both('Nur wenn du untertags eine Pause machst.', 'Only if you close for a break during the day.'),
  closesAgain: both('Schließt wieder um', 'Closes again at'),
  exceptions: both('Schließtage und Ausnahmen', 'Closures and exceptions'), exception: both('Ausnahme', 'Exception'), dates: both('Zeitraum', 'Dates'),
  reason: both('Grund', 'Reason'),
  reasonHint: both('Kurz, z. B. „Urlaub“ oder „Inventur“. Steht so auf der Website.', 'Keep it short, e.g. “Holiday” or “Stocktaking”. Shown like this on the website.'),
  exceptionClosed: both('Geschlossen', 'Closed'),
  closedOn: both('Geschlossen am', 'Closed on'),
  closedOnHint: both('Ein einzelner Tag. Für mehrere Tage nimm „Schließtage und Ausnahmen“.', 'A single day. For several days, use “Closures and exceptions”.'),
  closedNote: both('Grund für Besucher', 'Reason for visitors'),
  closedNoteHint: both('Steht auf der Website, z. B. „Wegen eines Wasserrohrbruchs“.', 'Shown on the website, e.g. “Because of a burst water pipe”.'),
  noticeDays: both('Schließungen ankündigen (Tage vorher)', 'Announce closures (days ahead)'),
  noticeDaysHint: both('So viele Tage vorher kündigt die Website eine Schließung oder einen geschlossenen Feiertag an.', 'How many days ahead the website announces a closure or a public holiday when you are closed.'),
  holidays: both('An Feiertagen', 'On public holidays'),
  holidaySunday: both('wie am Sonntag', 'same as Sunday'), holidayClosed: both('geschlossen', 'closed'), holidayNormal: both('normale Zeiten des Wochentags', 'the weekday’s usual hours'),
  holidaysHint: both(
    'Gilt für alle gesetzlichen Feiertage. „Wie am Sonntag“ nimmt die Sonntagszeiten, die an dem Tag gelten. Für andere Zeiten an einem einzelnen Feiertag trag unter „Schließtage und Ausnahmen“ eine Ausnahme ein.',
    'Applies to every public holiday. “Same as Sunday” uses the Sunday hours that apply on that day. For other hours on a single holiday, add an exception under “Closures and exceptions”.',
  ),
  closedToday: both('Heute geschlossen', 'Closed today'), holidaySetting: both('Öffnungszeiten an Feiertagen', 'Opening hours on public holidays'),
  plans: both('Öffnungszeiten ab Datum', 'Opening hours from a date'), planName: both('Name', 'Name'), planFrom: both('Gilt ab', 'Applies from'),
  planTo: both('Gilt bis', 'Applies until'), yearly: both('Jedes Jahr wiederholen', 'Repeat every year'),
  planAdd: both('Neue Öffnungszeiten ab …', 'New opening hours from …'), planEdit: both('Öffnungszeiten ab Datum bearbeiten', 'Edit hours from a date'),
  planRemove: both('Öffnungszeiten ab Datum entfernen', 'Remove hours from a date'),
}

/** Times only on a day that is not closed (a closed day keeps its stored times). */
const open = { field: 'closed', not: true } as const

/**
 * The two opening periods of a day (the stored limit). Neutral words, not "lunch" and "evening": a winter plan keeps
 * 17:00–21:30 in the first period, and the owner must not read that as lunch.
 */
function timeFields(t: HoursTexts) {
  return {
    from1: f.time(t.opens, { optional: true, showWhen: open }),
    to1: f.time(t.closes, { optional: true, showWhen: open }),
    from2: f.time(t.opensAgain, { optional: true, showWhen: open, hint: t.opensAgainHint }),
    to2: f.time(t.closesAgain, { optional: true, showWhen: open }),
  }
}

/** One 7-row week, shared by the standard hours and the hour plans. */
function weekField(t: HoursTexts, week: readonly WeekRow[]) {
  return f.list(t.week, {
    itemLabel: t.day,
    fields: {
      day: f.choice(t.day, { options: weekdays }),
      closed: f.boolean(t.closed),
      ...timeFields(t),
    },
    min: 7, max: 7, unique: 'day', default: week,
  })
}

/** @internal The hours single with a preset's texts and default week; sites use `hours()`. */
export function hoursBrick(t: HoursTexts, week: readonly WeekRow[], opts: BasicsOptions) {
  return single({
    label: opts.label ?? t.hours,
    ...sourceOf(opts),
    fields: {
      week: weekField(t, week),
      exceptions: f.list(t.exceptions, {
        itemLabel: t.exception,
        fields: {
          when: f.daterange(t.dates),
          reason: f.text(t.reason, { max: 140, hint: t.reasonHint }),
          // A new exception is a closure unless the owner says otherwise.
          closed: f.boolean(t.exceptionClosed, { default: true }),
          // Special hours: "closed" off and times set, e.g. 24 December from 11:00 to 14:00.
          ...timeFields(t),
        },
        max: 20, default: [],
      }),
      // Optional: "Clear" in the Studio clears it, and saving it empty lifts the closure.
      closedOn: f.date(t.closedOn, { optional: true, hint: t.closedOnHint }),
      closedNote: f.text(t.closedNote, { max: 140, optional: true, hint: t.closedNoteHint }),
      holidayNoticeDays: f.number(t.noticeDays, { min: 0, max: 60, step: 1, default: 14, hint: t.noticeDaysHint }),
      // Which holidays count is the site's `country` or `calendar` (code), so the hint says what the choice covers and
      // where a single holiday gets other hours.
      holidays: f.choice(t.holidays, {
        options: [
          { value: 'sunday', label: t.holidaySunday }, { value: 'closed', label: t.holidayClosed }, { value: 'normal', label: t.holidayNormal },
        ],
        optional: true, default: 'sunday', hint: t.holidaysHint,
      }),
    },
    tasks: [
      { id: 'closedToday', label: t.closedToday, kind: 'edit', fields: ['closedOn', 'closedNote'], prefill: { closedOn: '@today' } },
      // The lead time sits under the list, so the owner sees when visitors first read about a closure.
      { id: 'holiday', label: t.exceptions, kind: 'edit', fields: ['exceptions', 'holidayNoticeDays'] },
      { id: 'holidaySetting', label: t.holidaySetting, kind: 'edit', fields: ['holidays'] },
    ],
  })
}

/** @internal The hour plans with a preset's texts; sites use `hourPlans()`. */
export function hourPlansBrick(t: HoursTexts, week: readonly WeekRow[], opts: BasicsOptions) {
  return collection({
    label: opts.label ?? t.plans,
    ...sourceOf(opts),
    fields: {
      label: f.text(t.planName, { max: 80 }),
      from: f.date(t.planFrom),
      to: f.date(t.planTo, { optional: true }),
      yearly: f.boolean(t.yearly, { default: false }),
      week: weekField(t, week),
    },
    max: 12,
    order: { field: 'from', dir: 'asc' },
    tasks: [
      { id: 'add', label: t.planAdd, kind: 'create' },
      { id: 'edit', label: t.planEdit, kind: 'edit', pick: true, fields: ['label', 'from', 'to', 'yearly', 'week'] },
      { id: 'remove', label: t.planRemove, kind: 'remove' },
    ],
  })
}

/**
 * Weekly hours (two periods a day), closures, a closed day and the owner's choice for public holidays. Which holidays
 * count is the site's `country` or `calendar`; pass it to the rules (`hoursOn`, `todayState`) as `ctx.country` or `ctx.calendar`.
 */
export function hours(opts: BasicsOptions = {}) {
  return hoursBrick(neutral, officeWeek, opts)
}

/** Own weekly hours for a date range: a season (yearly) or "new hours from a date" (open end). */
export function hourPlans(opts: BasicsOptions = {}) {
  return hourPlansBrick(neutral, officeWeek, opts)
}
