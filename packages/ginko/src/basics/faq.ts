// Frequently asked questions, in the owner's order. The stored names are the agency preset's.
import { f } from '../core/fields.ts'
import { faqLd } from '../core/seo.ts'
import { collection } from '../core/site.ts'
import { sourceOf, t, type BasicsOptions } from './shared.ts'

export function faq(o: BasicsOptions = {}) {
  return collection({
    label: o.label ?? t('Häufige Fragen', 'FAQ', 'Preguntas frecuentes', 'Questions fréquentes'),
    ...sourceOf(o),
    max: 100,
    order: 'manual',
    tasks: [
      { id: 'add', kind: 'create', label: t('Frage hinzufügen', 'Add a question', 'Añadir una pregunta', 'Ajouter une question') },
      { id: 'edit', kind: 'edit', pick: true, fields: ['question', 'answer'], label: t('Frage bearbeiten', 'Edit a question', 'Editar una pregunta', 'Modifier une question') },
      { id: 'remove', kind: 'remove', label: t('Frage entfernen', 'Remove a question', 'Eliminar una pregunta', 'Retirer une question') },
    ],
    fields: {
      question: f.text(t('Frage', 'Question', 'Pregunta', 'Question')),
      answer: f.longtext(t('Antwort', 'Answer', 'Respuesta', 'Réponse')),
    },
  })
}

/** schema.org FAQPage for the questions shown on one page. */
export function faqJsonLd(items: readonly { question: string; answer: string }[]): Record<string, unknown> {
  return faqLd([...items])
}
