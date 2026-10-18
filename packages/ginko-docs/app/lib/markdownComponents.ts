// Math, mermaid and ```md preview examples for the docs layer. GinkoMarkdown shows their source by default (core stays free of KaTeX);
// a `components` map wins. Both load lazily, so a page without a formula or a diagram never loads KaTeX or mermaid.
// Math renders on the server (the HTML holds `.katex`); mermaid renders in the browser.
import { defineAsyncComponent } from 'vue'
import DocsTable from '../components/DocsTable.vue'

export const markdownComponents = {
  math: defineAsyncComponent(async () => {
    const [, { Math }] = await Promise.all([import('katex/dist/katex.min.css'), import('@comark/vue/plugins/math')])
    return Math
  }),
  mermaid: defineAsyncComponent(() => import('@comark/vue/plugins/mermaid').then((m) => m.Mermaid)),
  example: defineAsyncComponent(() => import('../components/DocsExample.vue')),
  table: DocsTable,
}
