// Registry entries of the code components, spread into `components` by `registry.ts`. Pure data, no Vue.
// A single code block is the plain `pre` tag of Markdown: it has no entry here, the Vue side overrides its renderer.
import { f } from '@lupinum/ginko'
import { defineComponents } from '@lupinum/ginko/internal'
import { appearance } from './fields.ts'

export const codeComponents = defineComponents({
  'code-group': {
    kind: 'block',
    label: { de: 'Code-Gruppe', en: 'Code group' },
    describe: {
      de: 'Zeigt mehrere Codeblöcke als Reiter, benannt nach Dateiname oder Sprache.',
      en: 'Shows several code blocks as tabs, named by file name or language.',
    },
    props: {},
    children: ['pre'],
    editor: { group: { de: 'Code', en: 'Code' }, example: '::code-group\n```bash [npm]\nnpm install ginko\n```\n```bash [pnpm]\npnpm add ginko\n```\n::' },
  },
  'code-tree': {
    kind: 'block',
    label: { de: 'Code-Baum', en: 'Code tree' },
    describe: {
      de: 'Zeigt einen Dateibaum und daneben den Code der gewählten Datei. Jeder Codeblock braucht den Pfad als Dateinamen.',
      en: 'Shows a file tree and, next to it, the code of the chosen file. Each code block needs its path as file name.',
    },
    props: {
      defaultValue: f.text({ de: 'Startdatei', en: 'Start file' }, { optional: true, max: 200, hint: { de: 'Pfad der Datei, die zuerst offen ist.', en: 'Path of the file that is open first.' } }),
      expandAll: f.boolean({ de: 'Alle Ordner offen', en: 'All folders open' }, { optional: true }),
    },
    children: ['pre'],
    editor: { group: { de: 'Code', en: 'Code' }, example: '::code-tree{defaultValue="app/app.vue"}\n```vue [app/app.vue]\n<template><NuxtPage /></template>\n```\n```ts [nuxt.config.ts]\nexport default defineNuxtConfig({})\n```\n::' },
  },
  files: {
    kind: 'block',
    label: { de: 'Dateien', en: 'Files' },
    describe: {
      de: 'Zeigt Dateien und Ordner als Liste. Eine eingerückte Liste ergibt einen Ordner.',
      en: 'Shows files and folders as a list. An indented list makes a folder.',
    },
    props: { active: f.text({ de: 'Markierte Datei', en: 'Selected file' }, { optional: true, max: 200, hint: { de: 'Pfad, zum Beispiel app/app.vue.', en: 'A path, for example app/app.vue.' } }), appearance },
    editor: { group: { de: 'Code', en: 'Code' }, example: '::files{active="app/app.vue"}\n- app\n  - app.vue\n  - components\n    - Header.vue\n- nuxt.config.ts\n::' },
  },
})
