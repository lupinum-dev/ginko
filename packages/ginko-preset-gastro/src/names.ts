// Names for visitors, per language. Option labels in the bricks are editor text; the bundle carries only codes.
import type { Weekday } from './hours.ts'

const allergensDe: Record<string, string> = {
  A: 'Gluten', B: 'Krebstiere', C: 'Ei', D: 'Fisch', E: 'Erdnuss', F: 'Soja', G: 'Milch',
  H: 'Schalenfrüchte', L: 'Sellerie', M: 'Senf', N: 'Sesam', O: 'Sulfite', P: 'Lupinen', R: 'Weichtiere',
}
const allergensEn: Record<string, string> = {
  A: 'Gluten', B: 'Crustaceans', C: 'Egg', D: 'Fish', E: 'Peanuts', F: 'Soy', G: 'Milk',
  H: 'Tree nuts', L: 'Celery', M: 'Mustard', N: 'Sesame', O: 'Sulphites', P: 'Lupin', R: 'Molluscs',
}

export const allergenNames = { de: allergensDe, en: allergensEn }

export const weekdayNames: Record<'de' | 'en', Record<Weekday, string>> = {
  de: { mo: 'Montag', tu: 'Dienstag', we: 'Mittwoch', th: 'Donnerstag', fr: 'Freitag', sa: 'Samstag', su: 'Sonntag' },
  en: { mo: 'Monday', tu: 'Tuesday', we: 'Wednesday', th: 'Thursday', fr: 'Friday', sa: 'Saturday', su: 'Sunday' },
}
