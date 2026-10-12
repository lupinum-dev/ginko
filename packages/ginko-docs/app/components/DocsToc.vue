<script setup lang="ts">
// The table of contents of a page: a rail beside the text on wide screens (`aside`), a menu in the docs bar
// on narrower ones (`menu`). The current section is the last heading that has passed the top of the screen.
interface TocLink { id: string, text: string, children?: TocLink[] }
const props = defineProps<{ links: TocLink[], variant: 'aside' | 'menu' }>()
const { t } = useI18n()
const { open, toggle } = useDocsPopover()

const flat = computed(() => props.links.flatMap((l) => [{ ...l, sub: false }, ...(l.children ?? []).map((c) => ({ ...c, sub: true }))]))
const current = ref<string>()

// A scroll listener instead of an IntersectionObserver: the text may render after this component on client
// navigation, and looking the headings up on each (throttled) scroll needs no bookkeeping for that.
let frame = 0
function spy() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    const top = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 96
    let id: string | undefined
    for (const l of flat.value) {
      const el = document.getElementById(l.id)
      if (el && el.getBoundingClientRect().top <= top + 8) id = l.id
    }
    current.value = id ?? flat.value[0]?.id
  })
}
onMounted(() => {
  spy()
  window.addEventListener('scroll', spy, { passive: true })
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  window.removeEventListener('scroll', spy)
})
watch(() => props.links, () => nextTick(spy))
// A long table of contents scrolls in its own box: keep the current entry in view (the box only, not the page).
const aside = ref<HTMLElement | null>(null)
watch(current, (id) => {
  const box = aside.value
  const link = id ? box?.querySelector<HTMLElement>(`a[href="#${CSS.escape(id)}"]`) : undefined
  if (!box || !link || box.scrollHeight <= box.clientHeight) return
  const top = link.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
  if (top < box.scrollTop + 32 || top > box.scrollTop + box.clientHeight - 48) box.scrollTop = top - box.clientHeight / 3
})
const title = computed(() => flat.value.find((l) => l.id === current.value)?.text)
</script>

<template>
  <nav v-if="props.variant === 'aside'" ref="aside" class="docs-toc" :aria-label="t('docs.onThisPage')">
    <p class="docs-toc-title">
      <Icon name="lucide:text-align-start" class="docs-icon" />{{ t('docs.onThisPage') }}
    </p>
    <ul class="docs-toc-list">
      <li v-for="l in flat" :key="l.id">
        <a :href="`#${l.id}`" :class="{ 'is-sub': l.sub }" :aria-current="current === l.id ? 'location' : undefined">{{ l.text }}</a>
      </li>
    </ul>
    <slot />
  </nav>
  <div v-else ref="popover" class="docs-toc-menu">
    <button type="button" :aria-expanded="open" aria-controls="docs-toc-menu" @click="toggle">
      <span>{{ title && flat.length > 1 ? title : t('docs.onThisPage') }}</span>
      <Icon name="lucide:chevron-down" class="docs-icon" />
    </button>
    <nav v-if="open" id="docs-toc-menu" class="docs-popover" :aria-label="t('docs.onThisPage')">
      <ul class="docs-toc-list">
        <li v-for="l in flat" :key="l.id">
          <a :href="`#${l.id}`" :class="{ 'is-sub': l.sub }" :aria-current="current === l.id ? 'location' : undefined" @click="toggle">{{ l.text }}</a>
        </li>
      </ul>
    </nav>
  </div>
</template>
