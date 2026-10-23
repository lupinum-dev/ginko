// The organisation behind the site: legal name, address and contact. The stored names are those of the agency
// preset's company brick, so a site built on it can switch without moving data. There is no country field: the
// country is part of the site's config.
import { f } from '../core/fields.ts'
import { single } from '../core/site.ts'
import { organizationLd, type OrganizationLdInput } from '../core/seo.ts'
import { sourceOf, t, type BasicsOptions } from './shared.ts'

export function site(o: BasicsOptions = {}) {
  const plain = { optional: true, translate: false } as const
  const fields = {
    legalName: f.text(t('Offizieller Name', 'Legal name', 'Nombre legal', 'Raison sociale'), {
      ...plain, hint: t('Wie im Register eingetragen.', 'As registered.', 'Tal como figura en el registro.', 'Tel qu’enregistré.'),
    }),
    street: f.text(t('Straße und Hausnummer', 'Street and number', 'Calle y número', 'Rue et numéro'), plain),
    postalCode: f.text(t('Postleitzahl', 'Postcode', 'Código postal', 'Code postal'), { ...plain, max: 10 }),
    city: f.text(t('Ort', 'Town or city', 'Localidad', 'Ville'), plain),
    email: f.text(t('E-Mail', 'Email', 'Correo electrónico', 'E-mail'), { optional: true, format: 'email' }),
    phone: f.text(t('Telefon', 'Phone', 'Teléfono', 'Téléphone'), {
      optional: true, format: 'tel', hint: t('Mit Ländervorwahl.', 'With country code.', 'Con prefijo internacional.', 'Avec l’indicatif du pays.'),
    }),
    registryNumber: f.text(t('Registernummer', 'Registration number', 'Número de registro', 'Numéro d’immatriculation'), plain),
    registryCourt: f.text(t('Registergericht', 'Registry', 'Registro', 'Greffe'), { optional: true }),
    vatId: f.text(t('Umsatzsteuer-ID', 'VAT number', 'NIF-IVA', 'Numéro de TVA'), plain),
  }
  return single({
    label: o.label ?? t('Kontakt und Anschrift', 'Contact and address', 'Contacto y dirección', 'Contact et adresse'),
    describe: t(
      'Name, Anschrift und Kontakt, zum Beispiel für das Impressum und die Fußzeile.',
      'Name, address and contact details, for example for the imprint and the footer.',
      'Nombre, dirección y datos de contacto, por ejemplo para el aviso legal y el pie de página.',
      'Nom, adresse et coordonnées, par exemple pour les mentions légales et le pied de page.',
    ),
    ...sourceOf(o),
    fields,
    tasks: [{
      id: 'edit', kind: 'edit',
      label: t('Kontaktdaten ändern', 'Change contact details', 'Cambiar los datos de contacto', 'Modifier les coordonnées'),
      fields: Object.keys(fields) as (keyof typeof fields)[],
    }],
  })
}

/** The values of a `site()` brick as the site reads them; every one is optional. */
export interface SiteData {
  legalName?: string
  street?: string
  postalCode?: string
  city?: string
  email?: string
  phone?: string
  registryNumber?: string
  registryCourt?: string
  vatId?: string
}

export interface SiteJsonLdOptions extends Pick<OrganizationLdInput, 'name' | 'url' | 'type' | 'logo' | 'sameAs'> {
  /** ISO 3166 code such as `DE`, written as `addressCountry`. Default (in `useGinkoSeo`): `country` of the site config. */
  country?: string
}

/**
 * schema.org Organization, LocalBusiness (or a subtype such as HealthAndBeautyBusiness) or NGO with the address and contact of the `site()` brick. On a page whose
 * JSON-LD has this node, the Nuxt module does not add its own Organization from `seo.organization`: pass that
 * config's `logo` and `sameAs` here.
 */
export function siteJsonLd(data: SiteData, o: SiteJsonLdOptions): Record<string, unknown> {
  return organizationLd({
    ...o,
    legalName: data.legalName,
    email: data.email,
    telephone: data.phone,
    address: { street: data.street, postalCode: data.postalCode, city: data.city, country: o.country },
    vatID: data.vatId,
  })
}
