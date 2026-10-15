// People: a team, a board, speakers. A person without a photo is the site's concern (for example an initials avatar).
import { f } from '../core/fields.ts'
import { collection } from '../core/site.ts'
import { compact } from '../core/seo.ts'
import { sourceOf, t, type BasicsOptions } from './shared.ts'

export function people(o: BasicsOptions = {}) {
  return collection({
    label: o.label ?? t('Personen', 'People', 'Personas', 'Personnes'),
    ...sourceOf(o),
    max: 100,
    order: 'manual',
    tasks: [
      { id: 'add', kind: 'create', label: t('Person hinzufügen', 'Add a person', 'Añadir una persona', 'Ajouter une personne') },
      { id: 'edit', kind: 'edit', pick: true, fields: ['name', 'role', 'bio', 'email', 'phone', 'photo'], label: t('Person bearbeiten', 'Edit a person', 'Editar una persona', 'Modifier une personne') },
      { id: 'remove', kind: 'remove', label: t('Person entfernen', 'Remove a person', 'Eliminar una persona', 'Retirer une personne') },
    ],
    fields: {
      // A name is the same in every language.
      name: f.text(t('Name', 'Name', 'Nombre', 'Nom'), { translate: false }),
      role: f.text(t('Rolle', 'Role', 'Función', 'Fonction'), { optional: true }),
      bio: f.longtext(t('Kurzbiografie', 'Short bio', 'Biografía breve', 'Courte biographie'), { optional: true }),
      email: f.text(t('E-Mail', 'Email', 'Correo electrónico', 'E-mail'), { optional: true, format: 'email', translate: false }),
      phone: f.text(t('Telefon', 'Phone', 'Teléfono', 'Téléphone'), { optional: true, format: 'tel', translate: false }),
      photo: f.image(t('Foto', 'Photo', 'Foto', 'Photo'), { optional: true }),
    },
  })
}

export interface PersonJsonLdInput {
  name: string
  /** The person's role (`jobTitle`). */
  role?: string
  /** A short bio (`description`). */
  bio?: string
  email?: string
  phone?: string
  /** Absolute URL of the photo. */
  image?: string
  /** Absolute URL of the person's page or website. */
  url?: string
  /** The organisation the person belongs to (`worksFor`). */
  worksFor?: { name: string; url?: string }
}

/** schema.org Person, for an entry of `people()` or `authors()`. */
export function personJsonLd(p: PersonJsonLdInput): Record<string, unknown> {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: p.name,
    jobTitle: p.role,
    description: p.bio,
    email: p.email,
    telephone: p.phone,
    image: p.image,
    url: p.url,
    worksFor: p.worksFor ? compact({ '@type': 'Organization', name: p.worksFor.name, url: p.worksFor.url }) : undefined,
  })
}
