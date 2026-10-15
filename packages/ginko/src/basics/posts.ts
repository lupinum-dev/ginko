// A blog and a changelog. The stored shape is the one of `@lupinum/ginko-docs/config` (posts with `authors` refs and
// `tags`, authors, changelog entries), which re-exports these factories: docs sites and basics sites store the same data.
import { f } from '../core/fields.ts'
import { collection, type RouteTemplate } from '../core/site.ts'
import type { Locale } from '../core/types.ts'
import { articleLd } from '../core/seo.ts'
import { sourceOf, t, type BasicsOptions } from './shared.ts'

export interface PostsOptions<R extends Record<Locale, RouteTemplate> | undefined> extends BasicsOptions {
  /** A page per post, e.g. `{ en: '/blog/[slug]', de: '/de/blog/[slug]' }`. */
  route?: R
  /** Most posts (default 500). */
  max?: number
  /**
   * The brick the post's `authors` name (default `'authors'`, the shape of `@lupinum/ginko-docs`). A site with a
   * `people()` brick passes `'people'`, so a writer is one entry for the team page and the byline.
   */
  authors?: string
}

/**
 * Posts, newest first. `authors` names entries of the `authors` brick (add `authors: authors()` to `bricks`), or of
 * the brick given as the `authors` option (for example `people`).
 * Files: `content/posts/<name>[.<locale>].md`.
 */
export function posts<const R extends Record<Locale, RouteTemplate> | undefined = undefined>(o: PostsOptions<R> = {}) {
  const tag = t('Schlagwort', 'Tag', 'Etiqueta', 'Mot-clé')
  return collection({
    label: o.label ?? t('Beiträge', 'Posts', 'Artículos', 'Articles'),
    ...sourceOf(o),
    max: o.max ?? 500,
    order: { field: 'date', dir: 'desc' },
    ...(o.route ? { route: o.route as R } : {}),
    fields: {
      title: f.text(t('Titel', 'Title', 'Título', 'Titre')),
      description: f.longtext(t('Beschreibung', 'Description', 'Descripción', 'Description'), { optional: true }),
      date: f.date(t('Datum', 'Date', 'Fecha', 'Date')),
      authors: f.refs(t('Autorinnen und Autoren', 'Authors', 'Autores', 'Auteurs'), { to: o.authors ?? 'authors', optional: true }),
      image: f.image(t('Bild', 'Image', 'Imagen', 'Image'), { optional: true }),
      tags: f.list(t('Schlagwörter', 'Tags', 'Etiquetas', 'Mots-clés'), { itemLabel: tag, fields: { tag: f.text(tag, { max: 40 }) }, max: 10, optional: true }),
      slug: f.slug(t('Adresse', 'Address', 'Dirección', 'Adresse'), { from: 'title' }),
      body: f.markdown(t('Text', 'Text', 'Texto', 'Texte'), { profile: 'page' }),
    },
  })
}

/** The people who write posts; a post names them in `authors`. Files: `content/authors/<name>[.<locale>].yml`. */
export function authors(o: BasicsOptions = {}) {
  return collection({
    label: o.label ?? t('Autorinnen und Autoren', 'Authors', 'Autores', 'Auteurs'),
    ...sourceOf(o),
    max: 100,
    order: 'manual',
    fields: {
      name: f.text(t('Name', 'Name', 'Nombre', 'Nom')),
      role: f.text(t('Rolle', 'Role', 'Función', 'Fonction'), { optional: true }),
      avatar: f.image(t('Bild', 'Image', 'Imagen', 'Image'), { optional: true }),
      /** Shown as a link on the author's name. */
      url: f.text(t('Website', 'Website', 'Sitio web', 'Site web'), { format: 'url', optional: true }),
    },
  })
}

export interface ChangelogOptions extends BasicsOptions {
  /** Most entries (default 500). */
  max?: number
}

/**
 * One entry per release, newest first. Files: `content/changelog/<name>[.<locale>].md` with `version` and `date` in
 * the frontmatter (a dot in the name reads as a language: use `v1-2-0.md`).
 */
export function changelog(o: ChangelogOptions = {}) {
  return collection({
    label: o.label ?? t('Änderungen', 'Changelog', 'Registro de cambios', 'Journal des modifications'),
    ...sourceOf(o),
    max: o.max ?? 500,
    order: { field: 'date', dir: 'desc' },
    fields: {
      version: f.text(t('Version', 'Version', 'Versión', 'Version'), { max: 40, translate: false }),
      date: f.date(t('Datum', 'Date', 'Fecha', 'Date')),
      body: f.markdown(t('Text', 'Text', 'Texto', 'Texte'), { profile: 'page' }),
    },
  })
}

export interface PostJsonLdInput {
  title: string
  /** Absolute URL of the post. */
  url: string
  /** The post's date (`YYYY-MM-DD`). */
  date: string
  /** When the post last changed (an ISO date or time). */
  modified?: string
  description?: string
  /** Absolute URL of the image. */
  image?: string
  /** The post's authors, as the `authors` brick has them; `url` is their website. */
  authors?: readonly { name: string; url?: string }[]
  tags?: readonly string[]
  /** The language of the post (BCP-47). */
  lang: string
}

/** schema.org BlogPosting for one post. */
export function postJsonLd(p: PostJsonLdInput): Record<string, unknown> {
  return articleLd({
    type: 'BlogPosting', title: p.title, url: p.url, description: p.description, image: p.image,
    published: p.date, modified: p.modified, author: p.authors, keywords: p.tags, lang: p.lang,
  })
}
