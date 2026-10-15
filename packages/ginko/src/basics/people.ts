// People: a team, a board, speakers. A person without a photo is the site's concern (for example an initials avatar).
import { f } from '../core/fields.ts'
import { collection, type RouteTemplate } from '../core/site.ts'
import { compact } from '../core/seo.ts'
import type { Locale } from '../core/types.ts'
import { sourceOf, t, type BasicsOptions } from './shared.ts'

export interface PeopleOptions<R extends Record<Locale, RouteTemplate> | undefined> extends BasicsOptions {
  /**
   * A page per person, e.g. `{ en: '/speakers/[slug]', de: '/de/vortragende/[slug]' }`. With it, each person gets a
   * web address (`slug`, made from the name). Without it the stored fields stay as they are.
   */
  route?: R
}

const slugField = () => f.slug(t('Adresse', 'Address', 'Dirección', 'Adresse'), { from: 'name' })
/** The `slug` field when people have pages: its type follows `route`, so `GinkoItem` has `slug` and `url` only then. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type SlugOf<R> = R extends undefined ? {} : { slug: ReturnType<typeof slugField> }

/** People in the owner's order. Files: `content/people/<n>.<name>[.<locale>].md`. */
export function people<const R extends Record<Locale, RouteTemplate> | undefined = undefined>(o: PeopleOptions<R> = {}) {
  return collection({
    label: o.label ?? t('Personen', 'People', 'Personas', 'Personnes'),
    ...sourceOf(o),
    max: 100,
    order: 'manual',
    ...(o.route ? { route: o.route as R } : {}),
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
      // Only with a route: the stored shape of people without pages does not change.
      // `o.route` is the runtime value of `R`, so the spread matches SlugOf<R>; TypeScript cannot narrow a generic by it.
      ...(o.route ? { slug: slugField() } : {}) as SlugOf<R>,
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
