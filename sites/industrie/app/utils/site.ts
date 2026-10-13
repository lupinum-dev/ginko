// The site's own routes and lookup tables. Fixed texts are ginko-i18n messages in i18n/<code>.json.
// Content comes from the bundle. Option labels in ginko.config.ts are editor text (SPEC 2), so job kinds
// and weekday names for visitors live in `labels`, in both languages.
import { formatMoney, plainText, type MarkdownValue, type Money } from '@lupinum/ginko'

export const companyName = 'Brunner Präzisionstechnik GmbH'

/** The short name for page titles. Address, phone and e-mail are content (brick `company`), maintained by the company. */
export const siteName = 'Brunner Präzisionstechnik'

/** Facts the home page states about the company. They are not content bricks; the marketing text changes rarely. */
export const facts = { employees: 180, exportCountries: 32 }

/** `tel:` link for a phone number as typed ("+43 7252 123 45" → "tel:+43725212345"). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, '')}`
}

export const weekdayKeys = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const
export type Weekday = (typeof weekdayKeys)[number]

/**
 * Lookup tables read with a dynamic key (`t()` takes only literal keys), so they stay in TypeScript, per language.
 * Fixed texts are ginko-i18n messages in i18n/<code>.json.
 */
export const labels = {
  de: {
    kinds: { fulltime: 'Vollzeit', parttime: 'Teilzeit', apprenticeship: 'Lehre' } as Record<string, string>,
    periods: { month: 'Monat', year: 'Jahr' } as Record<string, string>,
    weekdays: { mo: 'Montag', tu: 'Dienstag', we: 'Mittwoch', th: 'Donnerstag', fr: 'Freitag', sa: 'Samstag', su: 'Sonntag' } as Record<Weekday, string>,
    certStatus: { valid: 'gültig', soon: 'läuft bald ab', expired: 'abgelaufen' } as Record<CertStatus, string>,
    descriptions: {
      home: 'Präzisionsteile für Hydraulik und Antriebstechnik: Drehen, Fräsen und Schleifen in Serie. Brunner Präzisionstechnik in Steyr.',
      products: 'Drehteile, Baugruppen und Spannsysteme mit technischen Daten und Datenblättern.',
      careers: 'Offene Stellen und Lehrstellen bei Brunner Präzisionstechnik in Steyr, mit Gehaltsangabe.',
      news: 'Neuigkeiten und Pressemitteilungen von Brunner Präzisionstechnik.',
      events: 'Messen und Termine von Brunner Präzisionstechnik mit Zeitraum, Ort und Standnummer.',
      contact: 'Adresse, Empfangszeiten und Ansprechpartner von Brunner Präzisionstechnik in Steyr.',
      certificates: 'Zertifikate von Brunner Präzisionstechnik mit Gültigkeit und PDF zum Herunterladen.',
      imprint: 'Impressum von Brunner Präzisionstechnik.',
      privacy: 'Datenschutzerklärung von Brunner Präzisionstechnik.',
    } satisfies Record<GinkoPageKey, string>,
  },
  en: {
    kinds: { fulltime: 'Full-time', parttime: 'Part-time', apprenticeship: 'Apprenticeship' } as Record<string, string>,
    periods: { month: 'month', year: 'year' } as Record<string, string>,
    weekdays: { mo: 'Monday', tu: 'Tuesday', we: 'Wednesday', th: 'Thursday', fr: 'Friday', sa: 'Saturday', su: 'Sunday' } as Record<Weekday, string>,
    certStatus: { valid: 'valid', soon: 'expires soon', expired: 'expired' } as Record<CertStatus, string>,
    descriptions: {
      home: 'Precision parts for hydraulics and drive technology: turning, milling and grinding in series. Brunner Präzisionstechnik in Steyr, Austria.',
      products: 'Turned parts, assemblies and clamping systems with technical data and data sheets.',
      careers: 'Open positions and apprenticeships at Brunner Präzisionstechnik in Steyr, with the salary stated.',
      news: 'News and press releases from Brunner Präzisionstechnik.',
      events: 'Trade fairs and dates of Brunner Präzisionstechnik with dates, location and booth number.',
      contact: 'Address, reception hours and contacts of Brunner Präzisionstechnik in Steyr, Austria.',
      certificates: 'Certificates of Brunner Präzisionstechnik with validity and a PDF to download.',
      imprint: 'Imprint of Brunner Präzisionstechnik.',
      privacy: 'Privacy policy of Brunner Präzisionstechnik.',
    } satisfies Record<GinkoPageKey, string>,
  },
}

/** Weekday key of a YYYY-MM-DD date (calendar date, no time zone involved). */
export function weekdayOf(date: string): Weekday {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  return weekdayKeys[(day + 6) % 7]!
}

/** Node and browsers ship different ICU data; one space kind keeps server and client text equal. */
const nbsp = (text: string) => text.replace(/\s/g, ' ')

/** `492 KB` / `1,2 MB` (de), `1.2 MB` (en). The platform stores the size in bytes. */
export function formatSize(bytes: number, lang: GinkoLocale): string {
  const number = new Intl.NumberFormat(lang === 'de' ? 'de-AT' : 'en-GB', { maximumFractionDigits: 1 })
  return nbsp(bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${number.format(bytes / (1024 * 1024))} MB`)
}

/**
 * `ab € 2.800,50 brutto / Monat` / `from €2,800.50 gross / month`. `lang` picks the period label, `language` (BCP 47,
 * `useI18n().language`) the money notation; `from` and `gross` are the caller's messages.
 */
export function salaryText(job: { salary: Money; salaryPeriod: string }, lang: GinkoLocale, language: string, text: { from: string; gross: string }): string {
  // Salaries are whole euros in job ads ("ab € 2.800 brutto"); cents only when there are some.
  const amount = formatMoney(job.salary, language)
  const shown = job.salary.amount % 100 === 0 ? amount.replace(/[.,]00(?!\d)/, '') : amount
  return nbsp(`${text.from} ${shown} ${text.gross} / ${labels[lang].periods[job.salaryPeriod] ?? job.salaryPeriod}`)
}

/** The first `max` characters of a Markdown field as plain text, cut at a word and closed with an ellipsis. */
export function excerpt(value: MarkdownValue | undefined, max = 160): string {
  // In page state the field can be `{ ref }`; only a loaded tree has text to cut.
  const text = (value && 'nodes' in value ? plainText(value) : '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max / 2)).replace(/[\s.,;:–-]+$/, '')}…`
}

/** Initials for the contact circle: "Dr. Eva Brunner" → "EB". Titles ending in a dot are skipped. */
export function initials(name: string): string {
  const parts = name.split(/\s+/).filter((p) => p && !p.endsWith('.'))
  const first = parts[0]?.[0] ?? name[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1]![0] : ''
  return `${first}${last}`.toUpperCase()
}

export type CertStatus = 'valid' | 'soon' | 'expired'

/** A certificate is "soon" with fewer than `soonDays` days left, "expired" the day after its last day. */
export function certStatus(validUntil: string, today: string, soonDays = 60): CertStatus {
  const days = (Date.parse(`${validUntil}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000
  return days < 0 ? 'expired' : days < soonDays ? 'soon' : 'valid'
}

export interface DayHours { day: string; closed: boolean; from1?: string; to1?: string; from2?: string; to2?: string }
export interface Exception { _id: string; when: { from: string; to: string }; reason: string; closed: boolean }

/** The reception times of one weekday as text: `07:00–12:00 und 12:30–16:00`. Empty when closed. `and` is the caller's message. */
export function timesOf(day: DayHours | undefined, and: string): string {
  if (!day || day.closed) return ''
  const spans = [[day.from1, day.to1], [day.from2, day.to2]].filter(([a, b]) => a && b).map(([a, b]) => `${a}–${b}`)
  return spans.join(` ${and} `)
}

export type TodayState =
  | { kind: 'open'; times: string }
  /** `field` is the bundle path of the reason, for its language (closedNote or an exception's reason). */
  | { kind: 'closed'; reason?: string; field: string }
  | { kind: 'weekend' }

/**
 * Whether the reception is staffed today. Order: the "closed today" switch, then a closing
 * exception that covers today, then the weekly plan (a closed Saturday or Sunday is the weekend).
 */
export function todayState(hours: { week: DayHours[]; exceptions: Exception[]; closedOn?: string; closedNote?: string }, today: string, and: string): TodayState {
  if (hours.closedOn === today) return { kind: 'closed', reason: hours.closedNote || undefined, field: 'closedNote' }
  const exception = hours.exceptions.find((e) => e.closed && e.when.from <= today && today <= e.when.to)
  if (exception) return { kind: 'closed', reason: exception.reason, field: `exceptions.${exception._id}.reason` }
  const key = weekdayOf(today)
  const day = hours.week.find((d) => d.day === key)
  if (!day || day.closed) return key === 'sa' || key === 'su' ? { kind: 'weekend' } : { kind: 'closed', field: '' }
  return { kind: 'open', times: timesOf(day, and) }
}

/** Exceptions that are still running or start within `days` days from today, soonest first. */
export function exceptionsAhead(exceptions: Exception[], today: string, days: number): Exception[] {
  const limit = new Date(`${today}T12:00:00Z`)
  limit.setUTCDate(limit.getUTCDate() + days)
  const until = limit.toISOString().slice(0, 10)
  return exceptions.filter((e) => e.when.to >= today && e.when.from <= until).sort((a, b) => a.when.from.localeCompare(b.when.from))
}
