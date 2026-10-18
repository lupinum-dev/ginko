import type { PropType } from 'vue'
import type { ItemOf } from '@lupinum/ginko'
import type { docsCollection } from '@lupinum/ginko-docs/config'

// Override point: after the text of every docs page, before "Edit this page" and the pager. Renders nothing here; a
// site puts its own `components/DocsPageEnd.vue` (same name, prop `doc`) in its app to show a support box or a call
// to action. A render function, not an empty <template>: server and browser then agree on the empty placeholder.
export default defineComponent({
  name: 'DocsPageEnd',
  props: { doc: { type: Object as PropType<ItemOf<ReturnType<typeof docsCollection>['fields']>>, required: true } },
  render: () => null,
})
