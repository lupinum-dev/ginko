<script setup lang="ts">
import { docsAskLinks, docsMarkdownPath, type DocsAssistant } from '../lib/docsPage'
// "Copy page" copies the page as Markdown; the menu next to it opens the Markdown twin or a chat that reads it.
const props = defineProps<{ path: string, origin: string }>()
const { t } = useI18n()
const cfg = useAppConfig().docs?.markdownActions ?? {}
const assistants = {
  chatgpt: { icon: 'docs:openai', label: 'docs.openChatGpt' },
  claude: { icon: 'docs:claude', label: 'docs.openClaude' },
} as const satisfies Record<DocsAssistant, { icon: string, label: string }>
// Unknown names in `openIn` are skipped, so a typo in app.config.ts hides one entry instead of breaking the menu.
const openIn = (cfg.openIn ?? ['chatgpt', 'claude']).filter((id) => Object.hasOwn(assistants, id))
const { open, toggle } = useDocsPopover()
const mdPath = computed(() => docsMarkdownPath(props.path))
const links = computed(() => docsAskLinks(t('docs.askPrompt', { url: new URL(mdPath.value, props.origin).href })))

const { state, copy: copyText } = useDocsCopy()
const copy = () => copyText(() => $fetch<string>(mdPath.value, { responseType: 'text' }))
const menu = openIn.length > 0
</script>

<template>
  <div v-if="cfg.copy !== false || menu" ref="popover" class="docs-actions" role="group" :aria-label="t('docs.pageActions')">
    <button v-if="cfg.copy !== false" type="button" class="docs-button" @click="copy">
      <Icon :name="state === 'copied' ? 'lucide:check' : 'lucide:copy'" class="docs-icon" />
      <span aria-live="polite">{{ state === 'copied' ? t('docs.copied') : state === 'failed' ? t('docs.copyFailed') : t('docs.copyPage') }}</span>
    </button>
    <button type="button" class="docs-button" :aria-expanded="open" aria-controls="docs-page-menu" :aria-label="t('docs.moreActions')" @click="toggle">
      <Icon name="lucide:chevron-down" class="docs-icon" />
    </button>
    <ul v-if="open" id="docs-page-menu" class="docs-popover">
      <li>
        <a :href="mdPath" target="_blank">
          <Icon name="lucide:file-text" class="docs-icon" />
          <span>{{ t('docs.viewMarkdown') }}<small>{{ t('docs.viewMarkdownHint') }}</small></span>
        </a>
      </li>
      <li v-for="id in openIn" :key="id">
        <a :href="links[id]" target="_blank" rel="noopener">
          <Icon :name="assistants[id].icon" class="docs-icon" />
          <span>{{ t(assistants[id].label) }}<small>{{ t('docs.askHint') }}</small></span>
          <Icon name="lucide:arrow-up-right" class="docs-icon" />
        </a>
      </li>
    </ul>
  </div>
</template>
