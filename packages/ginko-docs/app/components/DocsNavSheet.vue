<script setup lang="ts">
// The docs navigation on phones when a site's layout holds the docs (in the layer's own frame the header menu has it):
// a sheet from the start edge. A native modal dialog: focus stays inside, Escape and a tap beside it close it, and the
// page behind cannot be reached. It closes on navigation and when the window grows to the sidebar width.
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const route = useRoute()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const wide = import.meta.client ? matchMedia('(min-width: 64rem)') : undefined
const onWide = () => { if (wide?.matches) open.value = false }

watch(open, (value) => {
  if (value) {
    dialog.value?.showModal()
    wide?.addEventListener('change', onWide)
  } else {
    dialog.value?.close()
    wide?.removeEventListener('change', onWide)
  }
})
watch(() => route.fullPath, () => { open.value = false })
onBeforeUnmount(() => wide?.removeEventListener('change', onWide))
</script>

<template>
  <dialog ref="dialog" class="docs-nav-sheet" :aria-label="t('docs.nav')" @close="open = false" @click.self="open = false">
    <div class="docs-nav-sheet-head">
      <p>{{ t('docs.contents') }}</p>
      <button type="button" class="docs-icon-button" :aria-label="t('docs.close')" @click="open = false">
        <DocsIcon name="lucide:x" class="docs-icon" />
      </button>
    </div>
    <div class="docs-nav-sheet-body">
      <DocsSidebar />
    </div>
  </dialog>
</template>
