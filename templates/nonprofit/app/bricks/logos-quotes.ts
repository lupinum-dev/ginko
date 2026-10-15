// Synced from templates/_features/logos-quotes/app/bricks/logos-quotes.ts by `pnpm templates sync`. Edit the source, not this copy.
import { collection, f, type BrickSource } from '@lupinum/ginko'

// Partner logos and short quotes for strips on the home page. Logos: one file each in content/logos/ with the image in
// public/logos/ (an SVG or a PNG on a transparent background); the number sets the order.
export function logos(o: { source?: BrickSource } = {}) {
  return collection({
    label: { de: 'Logos', en: 'Logos', fr: 'Logos' },
    ...(o.source ? { source: o.source } : {}),
    max: 24,
    order: 'manual',
    fields: {
      // A name is the same in every language; the image's description (`alt`) is translated.
      name: f.text({ de: 'Name', en: 'Name', fr: 'Nom' }, { max: 80, translate: false }),
      image: f.image({ de: 'Logo', en: 'Logo', fr: 'Logo' }),
      url: f.text({ de: 'Website', en: 'Website', fr: 'Site web' }, { format: 'url', optional: true }),
    },
    tasks: [
      { id: 'add', kind: 'create', label: { de: 'Logo hinzufügen', en: 'Add a logo', fr: 'Ajouter un logo' } },
      { id: 'remove', kind: 'remove', label: { de: 'Logo entfernen', en: 'Remove a logo', fr: 'Retirer un logo' } },
    ],
  })
}

// Quotes: what members, partners or customers say, with their permission. No photo: a quote stands by its words.
// One file each in content/quotes/; the number sets the order, and the home page shows the first one.
export function quotes(o: { source?: BrickSource } = {}) {
  return collection({
    label: { de: 'Zitate', en: 'Quotes', fr: 'Citations' },
    ...(o.source ? { source: o.source } : {}),
    max: 24,
    order: 'manual',
    fields: {
      text: f.longtext({ de: 'Zitat', en: 'Quote', fr: 'Citation' }, { max: 300 }),
      name: f.text({ de: 'Name', en: 'Name', fr: 'Nom' }, { max: 80, optional: true, translate: false }),
      role: f.text({ de: 'Rolle', en: 'Role', fr: 'Fonction' }, {
        max: 120,
        optional: true,
        hint: { de: 'Zum Beispiel „Kundin seit 2021“.', en: 'For example “Customer since 2021”.', fr: 'Par exemple « Cliente depuis 2021 ».' },
      }),
    },
    tasks: [
      { id: 'add', kind: 'create', label: { de: 'Zitat hinzufügen', en: 'Add a quote', fr: 'Ajouter une citation' } },
      { id: 'edit', kind: 'edit', pick: true, fields: ['text', 'name', 'role'], label: { de: 'Zitat bearbeiten', en: 'Edit a quote', fr: 'Modifier une citation' } },
    ],
  })
}
