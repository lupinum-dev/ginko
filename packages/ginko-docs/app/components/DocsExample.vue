<script setup lang="ts">
// A ```md preview fence (ginko-content parses it into `example`): what the Markdown renders, then the Markdown
// itself, as two tabs in one frame. The preview arrives as a parsed tree in a prop; the code block is the slot.
// One copy button serves both tabs (the code block's own is hidden in CSS), so it sits in the same place in each.
import type { MarkdownTree } from '@lupinum/ginko'
import { Tab, Tabs } from '@lupinum/ginko-components/components'

const props = defineProps<{ preview: MarkdownTree['nodes'] }>()
const { t } = useI18n()
const { t: tc } = useI18n('components') // the code block's own texts: "Copy code", "Copied"
const tree = computed<MarkdownTree>(() => ({ nodes: props.preview, toc: previewToc(props.preview) }))

const root = useTemplateRef<HTMLElement>('root')
const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
async function copy() {
  const text = (root.value?.querySelector('pre')?.textContent ?? '').replace(/\n$/, '')
  try { await navigator.clipboard.writeText(text) } catch { return }
  copied.value = true
  clearTimeout(timer)
  timer = setTimeout(() => { copied.value = false }, 2000)
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div ref="root" class="docs-example">
    <Tabs layout="line">
      <Tab :label="t('docs.example.preview')">
        <GinkoMarkdown :value="tree" :components="markdownComponents" class="docs-example-preview" />
      </Tab>
      <Tab :label="t('docs.example.source')">
        <slot />
      </Tab>
    </Tabs>
    <button type="button" class="ginko-code-copy docs-example-copy" :aria-label="tc('code.copy')" @click="copy">
      <Icon :name="copied ? 'lucide:check' : 'lucide:copy'" class="docs-icon" />
      <span class="ginko-code-status" aria-live="polite">{{ copied ? tc('code.copied') : '' }}</span>
    </button>
  </div>
</template>
