// Files to download, such as reports, product sheets or price lists (PDF), newest first.
import { f } from '../core/fields.ts'
import { collection } from '../core/site.ts'
import { limitOf } from '../core/uploads.ts'
import { sourceOf, t, type BasicsOptions } from './shared.ts'

export function downloads(o: BasicsOptions = {}) {
  return collection({
    label: o.label ?? t('Downloads', 'Downloads', 'Descargas', 'Téléchargements'),
    ...sourceOf(o),
    max: 100,
    order: { field: 'date', dir: 'desc' },
    tasks: [
      { id: 'add', kind: 'create', label: t('Datei hinzufügen', 'Add a file', 'Añadir un archivo', 'Ajouter un fichier') },
      { id: 'edit', kind: 'edit', pick: true, fields: ['title', 'summary', 'date', 'file', 'language'], label: t('Datei bearbeiten', 'Edit a file', 'Editar un archivo', 'Modifier un fichier') },
      { id: 'remove', kind: 'remove', label: t('Datei entfernen', 'Remove a file', 'Eliminar un archivo', 'Retirer un fichier') },
    ],
    fields: {
      title: f.text(t('Titel', 'Title', 'Título', 'Titre')),
      summary: f.longtext(t('Kurzbeschreibung', 'Summary', 'Resumen', 'Résumé'), { optional: true }),
      date: f.date(t('Datum', 'Date', 'Fecha', 'Date')),
      file: f.file(t('Datei', 'File', 'Archivo', 'Fichier'), { accept: ['pdf'], maxBytes: limitOf('file') }),
      // The language of the document (a code such as `en`): one file serves every language of the site, so the list
      // can say "in English" on the German page. Empty: the site's main language.
      language: f.text(t('Sprache des Dokuments', 'Language of the document', 'Idioma del documento', 'Langue du document'), {
        optional: true,
        translate: false,
        max: 35,
        hint: t('Sprachcode, zum Beispiel de oder en.', 'A language code, for example en or de.', 'Un código de idioma, por ejemplo es o en.', 'Un code de langue, par exemple fr ou en.'),
      }),
    },
  })
}
