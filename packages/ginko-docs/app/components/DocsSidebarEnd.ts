// Override point: below the docs navigation (sidebar, phone sheet and the header menu). Renders nothing here; a site
// puts its own `components/DocsSidebarEnd.vue` in its app to add links or a contact line. A render function, not an
// empty <template>: server and browser then agree on the empty placeholder.
export default defineComponent({ name: 'DocsSidebarEnd', render: () => null })
