// Registry entries of the quiz. Spread into `components` in `registry.ts`. Pure data, no Vue.
// The answers are a Markdown task list inside `quiz-question`: `- [x]` marks a right answer, `- [ ]` a wrong one.
import { f } from '@lupinum/ginko'
import { defineComponents } from '@lupinum/ginko/internal'
import { appearance, title } from './fields.ts'

export const learnComponents = defineComponents({
  quiz: {
    kind: 'block',
    label: { de: 'Quiz', en: 'Quiz' },
    describe: {
      de: 'Fragen zur Selbstkontrolle. Die Fragen werden nacheinander gezeigt, am Ende steht das Ergebnis. Es werden keine Daten gesendet.',
      en: 'Questions to check your own knowledge. The questions are shown one after another; the result comes at the end. No data is sent.',
    },
    props: {
      title,
      description: f.text({ de: 'Beschreibung', en: 'Description' }, { optional: true, max: 300 }),
      appearance,
    },
    children: ['quiz-question'],
    editor: {
      group: { de: 'Lernen', en: 'Learning' },
      example: ':::quiz{title="Kurz geprüft" description="Zwei Fragen zum Garten."}\n::quiz-question{question="Wann gießt man am besten?"}\n- [ ] Mittags\n- [x] Morgens\n\n#explanation\nAm Morgen verdunstet weniger Wasser.\n::\n::quiz-question{question="Was wächst im Schatten?" type="multiple"}\n- [x] Farn\n- [ ] Tomate\n- [x] Funkie\n::\n:::',
    },
  },
  'quiz-question': {
    kind: 'block',
    label: { de: 'Quizfrage', en: 'Quiz question' },
    describe: {
      de: 'Eine Frage im Quiz. Antworten als Aufgabenliste: „- [x]“ richtig, „- [ ]“ falsch; die Erklärung unter #explanation.',
      en: 'A question in the quiz. Answers as a task list: “- [x]” right, “- [ ]” wrong; the explanation under #explanation.',
    },
    props: {
      question: f.text({ de: 'Frage', en: 'Question' }, { max: 300 }),
      type: f.choice({ de: 'Art', en: 'Type' }, {
        options: [
          { value: 'single', label: { de: 'Eine richtige Antwort', en: 'One right answer' } },
          { value: 'multiple', label: { de: 'Mehrere richtige Antworten', en: 'Several right answers' } },
        ],
        optional: true, default: 'single',
      }),
    },
    slots: { explanation: { label: { de: 'Erklärung', en: 'Explanation' } } },
    parents: ['quiz'],
    editor: {
      group: { de: 'Lernen', en: 'Learning' },
      example: ':::quiz\n::quiz-question{question="Welche Zahl ist gerade?"}\n- [ ] 3\n- [x] 4\n\n#explanation\nGerade Zahlen sind durch 2 teilbar.\n::\n::quiz-question{question="Welche Zahl ist ungerade?"}\n- [x] 5\n- [ ] 6\n::\n:::',
    },
  },
})
