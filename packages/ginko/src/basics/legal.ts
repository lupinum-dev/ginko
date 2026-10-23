// Legal texts: one entry per text, each with its kind and one Markdown body. The stored names and kinds are those
// of the agency preset's legal brick; which texts a site needs depends on its country, so none is required.
import { f } from '../core/fields.ts'
import { collection, type RouteTemplate } from '../core/site.ts'
import type { Locale } from '../core/types.ts'
import { sourceOf, t, type BasicsOptions } from './shared.ts'

/** The kinds of legal text (`legalType`), in the agency preset's order: stored values, they never change. */
export const legalTypes = [
  { value: 'privacy', label: t('Datenschutz', 'Privacy policy', 'Política de privacidad', 'Politique de confidentialité') },
  { value: 'customer-privacy', label: t('Datenschutz für Kunden', 'Privacy policy for customers', 'Privacidad para clientes', 'Confidentialité pour les clients') },
  { value: 'imprint', label: t('Impressum', 'Imprint', 'Aviso legal', 'Mentions légales') },
  { value: 'terms', label: t('AGB', 'Terms and conditions', 'Términos y condiciones', 'Conditions générales') },
  { value: 'cookies', label: t('Cookies', 'Cookie policy', 'Política de cookies', 'Politique relative aux cookies') },
  { value: 'accessibility', label: t('Barrierefreiheit', 'Accessibility statement', 'Declaración de accesibilidad', 'Déclaration d’accessibilité') },
] as const

export interface LegalOptions<R extends Record<Locale, RouteTemplate> | undefined> extends BasicsOptions {
  /** A page per text, e.g. `{ en: '/[slug]', de: '/de/[slug]' }`. Without it the texts have no pages of their own. */
  route?: R
}

export function legal<const R extends Record<Locale, RouteTemplate> | undefined = undefined>(o: LegalOptions<R> = {}) {
  return collection({
    label: o.label ?? t('Rechtliches', 'Legal', 'Textos legales', 'Informations légales'),
    ...sourceOf(o),
    max: 20,
    order: 'manual',
    ...(o.route ? { route: o.route as R } : {}),
    tasks: [{
      id: 'update', kind: 'edit', pick: true, fields: ['body', 'updatedAt'], prefill: { updatedAt: '@today' },
      label: t('Rechtstext aktualisieren', 'Update a legal text', 'Actualizar un texto legal', 'Mettre à jour un texte juridique'),
    }],
    fields: {
      title: f.text(t('Titel', 'Title', 'Título', 'Titre')),
      description: f.longtext(t('Beschreibung', 'Description', 'Descripción', 'Description'), { optional: true }),
      slug: f.slug(t('Adresse', 'Address', 'Dirección', 'Adresse'), { from: 'title' }),
      legalType: f.choice(t('Art', 'Kind', 'Tipo', 'Type'), { options: legalTypes }),
      updatedAt: f.date(t('Stand', 'Last updated', 'Última actualización', 'Dernière mise à jour')),
      // Never machine-translated: a legal text in another language is a legal text of its own. Profile `page`, so the
      // imprint can quote the address and contact as facts (`:fact{name="site.street"}`) instead of copying them.
      body: f.markdown(t('Text', 'Text', 'Texto', 'Texte'), { translate: 'manual', profile: 'page' }),
    },
  })
}
