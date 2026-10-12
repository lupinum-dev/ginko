// The site's own routes and lookup labels. Fixed texts come from i18n/<lang>.json (ginko-i18n); content comes from the bundle.
// Option labels in ginko.config.ts are editor text (SPEC 2), so the tag names for visitors live here, in all languages.
import { formatMoney, type Money } from '@lupinum/ginko'

export type LegalKey = 'terms' | 'avv' | 'privacy' | 'imprint'
/** The legal brick fields and the page each is shown on (the config's page key for the AVV is `dpa`). */
export const legalPages = { terms: 'terms', avv: 'dpa', privacy: 'privacy', imprint: 'imprint' } as const satisfies Record<LegalKey, GinkoPageKey>

/** The product name. Address and e-mail are content (brick `company`), maintained by the owner. */
export const siteName = 'Taktwerk'

/** `tel:` link for a phone number as typed ("+49 30 000 000" → "tel:+4930000000"). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, '')}`
}

// The sample time sheet in the hero. Times are fixed; day and place are texts. Net = span minus a 30 minute break.
export const sheetTimes = [
  { from: '07:02', to: '16:31', net: '8:59' },
  { from: '06:58', to: '15:44', net: '8:16' },
  { from: '07:10', to: '16:02', net: '8:22' },
] as const
export const sheetTotal = '25:37'

// Fixed texts live in i18n/<lang>.json (ginko-i18n). What stays here is read by a dynamic key or is a table of values:
// the navigation and page names (by key), the VAT note (by currency), the changelog tags (by value) and the sample time sheet rows.
const de = {
  nav: { features: 'Funktionen', pricing: 'Preise', changelog: 'Changelog', blog: 'Blog', faq: 'FAQ' },
  // Title and description of every page (SEO). The title of a legal page is also its link text in the footer.
  pages: {
    home: { title: 'Zeiterfassung für Handwerksbetriebe', description: 'Taktwerk erfasst Arbeitszeiten auf der Baustelle, auch ohne Netz. Stundenzettel, Pausen und Lohn-Export für Handwerksbetriebe in Berlin und Zürich.' },
    pricing: { title: 'Preise', description: 'Die Tarife von Taktwerk im Überblick: monatlich oder jährlich, in Euro oder Franken.' },
    changelog: { title: 'Changelog', description: 'Was neu ist in Taktwerk: Versionen, Verbesserungen und behobene Fehler.' },
    blog: { title: 'Blog', description: 'Artikel rund um Arbeitszeit, Pausen und Abrechnung im Handwerk.' },
    faq: { title: 'Häufige Fragen', description: 'Antworten auf die häufigsten Fragen zu Taktwerk: Testphase, Offline-Betrieb, Export und Preise.' },
    terms: { title: 'AGB', description: 'Allgemeine Geschäftsbedingungen von Taktwerk.' },
    dpa: { title: 'AVV', description: 'Vertrag zur Auftragsverarbeitung (AVV) für Taktwerk.' },
    privacy: { title: 'Datenschutz', description: 'Datenschutzerklärung von Taktwerk.' },
    imprint: { title: 'Impressum', description: 'Impressum und Anbieterkennzeichnung von Taktwerk.' },
  } satisfies Record<GinkoPageKey, { title: string; description: string }>,
  vat: { EUR: 'Alle Preise zzgl. MwSt.', CHF: 'Alle Preise zzgl. MWST.' },
  tags: { new: 'Neu', improved: 'Verbessert', fixed: 'Behoben' } as Record<string, string>,
  sheetRows: [
    { day: 'Mo', place: 'Baustelle Kreuzberg' },
    { day: 'Di', place: 'Dachstuhl Pankow' },
    { day: 'Mi', place: 'Lager Neukölln' },
  ],
}

export type Labels = typeof de

const en: Labels = {
  nav: { features: 'Features', pricing: 'Pricing', changelog: 'Changelog', blog: 'Blog', faq: 'FAQ' },
  pages: {
    home: { title: 'Time tracking for trade businesses', description: 'Taktwerk records working hours on site, even without a network. Timesheets, breaks and payroll export for trade businesses in Berlin and Zurich.' },
    pricing: { title: 'Pricing', description: 'The Taktwerk plans at a glance: monthly or yearly, in euro or Swiss francs.' },
    changelog: { title: 'Changelog', description: 'What is new in Taktwerk: versions, improvements and fixed bugs.' },
    blog: { title: 'Blog', description: 'Articles about working time, breaks and billing in the trades.' },
    faq: { title: 'Frequently asked questions', description: 'Answers to the most common questions about Taktwerk: trial, offline use, export and pricing.' },
    terms: { title: 'Terms', description: 'Terms and conditions of Taktwerk.' },
    dpa: { title: 'DPA', description: 'Data processing agreement (DPA) for Taktwerk.' },
    privacy: { title: 'Privacy', description: 'Privacy policy of Taktwerk.' },
    imprint: { title: 'Imprint', description: 'Imprint and provider details of Taktwerk.' },
  },
  vat: { EUR: 'All prices plus VAT.', CHF: 'All prices plus VAT.' },
  tags: { new: 'New', improved: 'Improved', fixed: 'Fixed' },
  sheetRows: [
    { day: 'Mon', place: 'Kreuzberg site' },
    { day: 'Tue', place: 'Pankow roof frame' },
    { day: 'Wed', place: 'Neukölln depot' },
  ],
}

const fr: Labels = {
  nav: { features: 'Fonctions', pricing: 'Tarifs', changelog: 'Changelog', blog: 'Blog', faq: 'FAQ' },
  pages: {
    home: { title: 'Suivi du temps pour les artisans', description: 'Taktwerk enregistre les heures de travail sur le chantier, même sans réseau. Feuilles de temps, pauses et export de paie pour les artisans de Berlin et de Zurich.' },
    pricing: { title: 'Tarifs', description: 'Les formules Taktwerk en un coup d’œil : par mois ou par an, en euros ou en francs suisses.' },
    changelog: { title: 'Changelog', description: 'Les nouveautés de Taktwerk : versions, améliorations et corrections.' },
    blog: { title: 'Blog', description: 'Articles sur le temps de travail, les pauses et la facturation dans l’artisanat.' },
    faq: { title: 'Questions fréquentes', description: 'Réponses aux questions les plus fréquentes sur Taktwerk : essai, mode hors ligne, export et tarifs.' },
    terms: { title: 'CGV', description: 'Conditions générales de vente de Taktwerk.' },
    dpa: { title: 'Sous-traitance', description: 'Contrat de sous-traitance de données (AVV) pour Taktwerk.' },
    privacy: { title: 'Confidentialité', description: 'Politique de confidentialité de Taktwerk.' },
    imprint: { title: 'Mentions légales', description: 'Mentions légales et informations sur l’éditeur de Taktwerk.' },
  },
  vat: { EUR: 'Tous les prix hors TVA.', CHF: 'Tous les prix hors TVA.' },
  tags: { new: 'Nouveau', improved: 'Amélioré', fixed: 'Corrigé' },
  sheetRows: [
    { day: 'Lun', place: 'Chantier Kreuzberg' },
    { day: 'Mar', place: 'Charpente Pankow' },
    { day: 'Mer', place: 'Dépôt Neukölln' },
  ],
}

export const labels: Record<GinkoLocale, Labels> = { de, en, fr }

/** Tag name for a visitor; a value this site does not know yet shows as it is (choice fallback). */
export function tagLabel(value: string, tags: Record<string, string>): string {
  return Object.hasOwn(tags, value) ? tags[value]! : value
}

/** Node and browsers ship different ICU data; one space kind keeps server and client text equal. */
const nbsp = (text: string) => text.replace(/\s/g, ' ')

// Fixed month names: ICU versions disagree on the short forms ("Sep" or "Sept"), and the changelog dates must not move.
const months: Record<Exclude<GinkoLocale, 'de'>, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
}

/** Numeric date for the changelog: `1.10.2026` / `1 Oct 2026` / `1 oct. 2026`. */
export function formatShortDate(date: string, lang: GinkoLocale): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return lang === 'de' ? `${d}.${m}.${y}` : nbsp(`${d} ${months[lang][m - 1]} ${y}`)
}

export type Period = 'month' | 'year'
export type Currency = 'EUR' | 'CHF'

interface PlanPrices { priceEur: Money; priceChf: Money; yearEur?: Money; yearChf?: Money }

/** The price of a plan for a billing period and currency; undefined when the plan has no yearly price. */
/** A price as shown: whole amounts without cents ("29 €", "32 CHF" in German), cents only when there are some. */
export function priceText(money: Money, lang: GinkoLocale): string {
  const text = formatMoney(money, lang)
  return money.amount % 100 === 0 ? text.replace(/[.,]00(?!\d)/, '') : text
}

export function planPrice(plan: PlanPrices, period: Period, currency: Currency): Money | undefined {
  if (period === 'month') return currency === 'EUR' ? plan.priceEur : plan.priceChf
  return currency === 'EUR' ? plan.yearEur : plan.yearChf
}
