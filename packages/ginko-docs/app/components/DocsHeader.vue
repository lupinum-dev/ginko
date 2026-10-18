<script setup lang="ts">
// The standalone header: brand, the site's sections (Docs, Blog, Changelog and the site's own links), search,
// language, light/dark and social links. On phones the menu button opens one full-screen menu: the
// languages as links at its top, the docs navigation (on docs pages), the site links and social links, and the
// Auto/Light/Dark switch. The light/dark button stays in the header on phones too.
const { t, localePath } = useI18n()
const cfg = useAppConfig().docs ?? {}
const title = cfg.title ?? useGinkoSite().name
const { text, href } = useDocsSite()
const docs = useDocs()
const blog = useDocsBlog()
const route = useRoute()

const within = (base: string | undefined) => !!base && (route.path === base || route.path.startsWith(`${base}/`))
const links = computed(() => [
  ...(docs.first.value ? [{ key: 'docs', label: t('docs.docs'), to: docs.first.value, active: within(docs.base.value) }] : []),
  ...(blog.hasPosts ? [{ key: 'blog', label: t('docs.blog'), to: blog.blogPath.value, active: within(blog.blogPath.value) }] : []),
  ...(blog.hasChangelog ? [{ key: 'changelog', label: t('docs.changelog'), to: blog.changelogPath.value, active: within(blog.changelogPath.value) }] : []),
  ...(cfg.nav ?? []).map((l) => ({ key: l.id, label: text(`docs.nav.${l.id}`), to: href(l.href), active: within(href(l.href)) })),
])

// The phone menu. Where the docs navigation shows: on the docs pages only (not the blog or the start page).
const menu = ref(false)
const inDocs = computed(() => within(docs.base.value))
const button = useTemplateRef<HTMLButtonElement>('button')
const panel = useTemplateRef<HTMLElement>('panel')

function close(refocus = false) {
  if (!menu.value) return
  menu.value = false
  if (refocus) button.value?.focus()
}
function onKey(e: KeyboardEvent) {
  // An open language popover takes the first Escape.
  if (e.key === 'Escape' && !panel.value?.querySelector('.docs-popover')) close(true)
}
const wide = import.meta.client ? matchMedia('(min-width: 64rem)') : undefined
const onWide = () => { if (wide?.matches) close() }

// While open: the page behind does not scroll, Escape closes, and focus moves in (and back to the button on close).
watch(menu, async (open) => {
  document.documentElement.style.overflow = open ? 'hidden' : ''
  if (open) {
    document.addEventListener('keydown', onKey)
    wide?.addEventListener('change', onWide)
    await nextTick()
    panel.value?.focus()
  } else {
    document.removeEventListener('keydown', onKey)
    wide?.removeEventListener('change', onWide)
  }
})
watch(() => route.fullPath, () => close())
onBeforeUnmount(() => {
  document.documentElement.style.overflow = ''
  document.removeEventListener('keydown', onKey)
  wide?.removeEventListener('change', onWide)
})
</script>

<template>
  <header class="docs-header">
    <div class="docs-header-inner">
      <NuxtLink :to="localePath('/')" class="docs-brand">
        <template v-if="cfg.logo">
          <img :class="{ 'docs-when-light': cfg.logo.dark }" :src="cfg.logo.light" :alt="cfg.logo.wordmark ? title : ''">
          <img v-if="cfg.logo.dark" class="docs-when-dark" :src="cfg.logo.dark" alt="">
        </template>
        <span v-if="!cfg.logo?.wordmark">{{ title }}</span>
      </NuxtLink>
      <nav v-if="links.length > 1 || cfg.nav?.length" class="docs-nav-links" :aria-label="t('docs.siteLinks')">
        <NuxtLink v-for="l in links" :key="l.key" :to="l.to" :aria-current="l.active ? 'page' : undefined">{{ l.label }}</NuxtLink>
      </nav>
      <div class="docs-header-end">
        <DocsSearch />
        <DocsLanguage />
        <DocsThemeToggle />
        <template v-if="cfg.social?.length">
          <span class="docs-header-sep" aria-hidden="true" />
          <div class="docs-social">
            <a v-for="s in cfg.social" :key="s.href" class="docs-icon-button" :href="s.href" target="_blank" rel="noopener" :aria-label="s.label" :title="s.label">
              <DocsIcon :name="s.icon" class="docs-icon" />
            </a>
          </div>
        </template>
        <button
          ref="button" type="button" class="docs-icon-button docs-header-menu" :aria-expanded="menu" aria-controls="docs-menu"
          :aria-label="menu ? t('docs.close') : t('docs.siteMenu')" @click="menu = !menu"
        >
          <DocsIcon :name="menu ? 'lucide:x' : 'lucide:menu'" class="docs-icon" />
        </button>
      </div>
    </div>
    <!-- Teleported: the header's backdrop blur would otherwise make it the containing block of the fixed menu. -->
    <Teleport to="body">
      <div v-if="menu" id="docs-menu" ref="panel" class="docs-menu" role="dialog" tabindex="-1" :aria-label="t('docs.siteMenu')">
        <DocsLanguage list />
        <div v-if="inDocs" class="docs-menu-scroll">
          <DocsSidebar />
        </div>
        <div class="docs-menu-more">
          <nav class="docs-menu-links" :aria-label="t('docs.siteLinks')">
            <NuxtLink v-for="l in links" :key="l.key" :to="l.to" :aria-current="l.active ? 'page' : undefined">{{ l.label }}</NuxtLink>
            <a v-for="s in cfg.social ?? []" :key="s.href" :href="s.href" target="_blank" rel="noopener">{{ s.label }}</a>
          </nav>
        </div>
        <div class="docs-menu-foot">
          <DocsThemeToggle segmented />
        </div>
      </div>
    </Teleport>
  </header>
</template>
