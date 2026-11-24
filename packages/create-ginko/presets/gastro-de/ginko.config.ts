// Öffnungszeiten und Speisekarte aus dem Gastro-Preset, beide aus Markdown-Dateien in content/.
// Die anderen Bausteine des Presets (Hinweise, Mittagsmenü, Veranstaltungen, Galerie) und die Schnellaufgaben
// für Inhaber brauchen die Ginko-Plattform.
import { defineSite } from '@lupinum/ginko'
import { hours, menu } from '@lupinum/ginko-preset-gastro'

export default defineSite({
  name: '{{SITE}}',
  studio: { id: '{{SITE}}', bricks: [] }, // die Kennung der Website auf einer Ginko-Plattform; noch kein Baustein wird dort bearbeitet
  url: 'https://example.com',
  timeZone: 'Europe/Vienna', // für dein Land ändern
  locales: ['de'],
  currency: 'EUR', // für dein Land ändern
  week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] },
  pages: { home: '/' },
  // Steht in Suchergebnissen und Link-Vorschauen. Ersetze es durch einen Satz über deine Website.
  // `color`: the brand colour of the generated share cards.
  seo: { description: 'Öffnungszeiten und Speisekarte unseres Restaurants.', color: '#1e4032' },
  bricks: {
    // content/hours.md: die Öffnungszeiten der Woche. Die Regeln dazu (hoursOn, todayState) zählen die österreichischen
    // Feiertage; mit calendar: 'DE', 'SG' oder 'none' änderst du das.
    hours: hours(),
    // content/menu/: eine Datei pro Gericht. allergens: 'none' lässt das Feld für Allergene weg.
    menu: menu({ allergens: 'none' }),
  },
})
