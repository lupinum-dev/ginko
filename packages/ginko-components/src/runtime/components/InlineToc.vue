<script setup lang="ts">
import { computed, inject, unref, type Ref } from 'vue'
import { GINKO_TOC_KEY, type MarkdownToc, type TocLink } from '@lupinum/ginko'
import { isOn } from './interactive-utils'
import SvgIcon from './SvgIcon.vue'
import { useText } from './text'

// The table of contents of the tree <GinkoMarkdown> renders, provided under `ginko:toc`. No headings: nothing renders.
// Closed by default (one line with the title); `open` shows the list from the start.
const props = defineProps<{ title?: string; depth?: string | number; open?: boolean | string }>()
const isOpen = computed(() => isOn(props.open))
const t = useText()
const provided = inject<Ref<MarkdownToc | null | undefined> | MarkdownToc | null>(GINKO_TOC_KEY, null)

const maxDepth = computed(() => Number(props.depth) || Infinity)
function limit(links: readonly TocLink[]): TocLink[] {
  return links.filter((l) => l.depth <= maxDepth.value).map((l) => ({ ...l, children: l.children ? limit(l.children) : undefined }))
}
const links = computed(() => limit(unref(provided)?.links ?? []))
</script>

<template>
  <details v-if="links.length" class="ginko-inline-toc" :open="isOpen || undefined">
    <summary class="ginko-inline-toc-title">
      <SvgIcon class="ginko-inline-toc-icon" name="toc" />
      {{ title || t('toc.title') }}
    </summary>
    <nav :aria-label="title || t('toc.title')">
      <ul class="ginko-inline-toc-list">
        <li v-for="link in links" :key="link.id">
          <a class="ginko-inline-toc-link" :href="`#${link.id}`">{{ link.text }}</a>
          <ul v-if="link.children?.length">
            <li v-for="child in link.children" :key="child.id">
              <a class="ginko-inline-toc-link" :href="`#${child.id}`">{{ child.text }}</a>
              <ul v-if="child.children?.length">
                <li v-for="grand in child.children" :key="grand.id"><a class="ginko-inline-toc-link" :href="`#${grand.id}`">{{ grand.text }}</a></li>
              </ul>
            </li>
          </ul>
        </li>
      </ul>
    </nav>
  </details>
</template>
