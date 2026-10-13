<!-- Pages of one site: its name, "View site", the views (UI.md 2, 10.2). -->
<script setup lang="ts">
import { api } from '#convex/api'
import { weekOfSchema, type ComponentRegistry, type Schema } from '@lupinum/ginko/internal'
import { provideGinkoAssets } from '@lupinum/ginko-editor'
import { CircleCheckIcon, FileTextIcon, HistoryIcon, ImageIcon, SearchIcon, SparklesIcon, SquareArrowOutUpRightIcon, SunIcon, UsersIcon } from '@lucide/vue'
import { OWN_BOTTOM_BAR, type SiteLink } from '../utils/siteLinks'
import { EDITOR_COMPONENTS } from '@studio/components/editor/context'
import { provideStudioSite } from '../utils/labels'

const route = useRoute()
const { t, format } = useI18n()
const slug = computed(() => String(route.params.site))
// Every form under this layout (Schnell ändern, Alles bearbeiten) uploads to this site.
provideGinkoAssets(useConvexGinkoAssets(slug))
const { data, error } = useConvexQuery(api.sites.get, () => ({ site: slug.value }))
// A site whose deletion has started opens for nothing but cancelling it (`sites.get` is refused for everyone then).
const { data: deletion } = useConvexQuery(api.sites.deletion, () => ({ site: slug.value }))
// The slash menu of Markdown fields offers the components of this site's schema.
provide(EDITOR_COMPONENTS, () => (data.value?.site.schema as { components?: ComponentRegistry } | undefined)?.components)
// Labels and prices under this layout read the site's main language and currency.
provideStudioSite({ main: () => data.value?.site.schema.locales[0] ?? '', currency: () => data.value?.site.schema.currency ?? 'EUR' })
// Date fields under this layout count "today" and weeks in the site's zone and week (`schema.week`).
provide('ginko:timezone', computed(() => data.value?.site.schema.timezone ?? 'Europe/Vienna'))
provide('ginko:week', computed(() => weekOfSchema((data.value?.site.schema ?? {}) as Schema)))
// Signed out in another tab, or removed from the team while working here: no page, sheet or button
// stays usable (break-it 9). The page says what happened and what to do.
const { status } = useConvexAuth()
const signedOut = computed(() => status.value === 'anonymous')
// "Seite ansehen" opens the local site on a local platform; the browser decides, so after mount (no hydration mismatch).
const mounted = ref(false)
onMounted(() => { mounted.value = true })
const viewUrl = computed(() => data.value && (mounted.value ? siteOrigin(data.value.site) : data.value.site.url))
const manager = computed(() => data.value?.role === 'owner' || data.value?.role === 'admin')
// Approvers see how many changes wait for them (UI.md 10.2); hidden at zero, so a solo owner sees nothing new.
const { data: toReview } = useConvexQuery(api.proposals.count, () => (manager.value ? { site: slug.value } : 'skip'))
// ⌘K / Ctrl+K opens the command palette on every page of the site (UI.md 10.6).
const paletteOpen = ref(false)
const apple = ref(true)
const shortcut = computed(() => (apple.value ? t('basics.search.shortcutMac') : t('basics.search.shortcutOther')))
function onShortcut(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    paletteOpen.value = !paletteOpen.value
  }
}
onMounted(() => {
  apple.value = /Mac|iPhone|iPad/.test(navigator.platform)
  window.addEventListener('keydown', onShortcut)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onShortcut))
// "Update website now" for owner and admin, with "Last update" under it (`sites.get` `lastRefreshAt`).
const siteUpdate = useUpdateSite(() => slug.value)
const lastRefresh = computed(() => data.value?.site.lastRefreshAt)
const base = computed(() => `/s/${slug.value}`)
const links = computed<SiteLink[]>(() => [
  { to: base.value, label: t('nav.quick'), short: t('nav.short.quick'), icon: SunIcon, exact: true },
  { to: `${base.value}/all`, label: t('nav.all'), short: t('nav.short.all'), icon: FileTextIcon },
  ...(manager.value ? [{ to: `${base.value}/review`, label: t('nav.toReview', { count: toReview.value ?? 0 }), short: t('nav.short.review'), icon: CircleCheckIcon, count: toReview.value || undefined }] : []),
  { to: `${base.value}/files`, label: t('nav.files'), short: t('nav.short.files'), icon: ImageIcon },
  { to: `${base.value}/history`, label: t('nav.history'), short: t('nav.short.history'), icon: HistoryIcon },
  ...(manager.value ? [{ to: `${base.value}/team`, label: t('nav.team'), short: t('nav.short.team'), icon: UsersIcon }] : []),
  { to: `${base.value}/ai`, label: t('nav.ai'), short: t('nav.short.ai'), icon: SparklesIcon },
])
const siteName = computed(() => data.value?.site.name ?? '…')
const initial = computed(() => (data.value?.site.name ?? '').trim().charAt(0).toUpperCase() || '·')
// The entry editor has its own bar at the bottom (save), so phones show no tab bar while one is open.
const ownBottomBar = ref(0)
provide(OWN_BOTTOM_BAR, ownBottomBar)
const showTabs = computed(() => ownBottomBar.value === 0)
// Signed out or no access: no site to navigate, so no rail, bars or site name (the message offers the way out).
const blocked = computed(() => signedOut.value || !!error.value || !!deletion.value)
</script>

<template>
  <!-- Wide screens: the rail on the page background, the page in a framed panel. Phones: a top bar, the page, tabs
       at the bottom. --studio-header-height is what sticks above the page (sticky toolbars and panes sit below it). -->
  <div class="min-h-dvh [--studio-header-height:57px] min-[900px]:flex min-[900px]:gap-4 min-[900px]:p-4 min-[900px]:[--studio-header-height:1rem]">
    <a href="#studio-main" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:ring-3 focus:ring-ring/80 focus:outline-none">{{ t('nav.skip') }}</a>
    <SiteRail v-if="!blocked" class="max-[899px]:hidden" :links="links" :initial="initial" :site-name="siteName">
      <template #foot>
        <AccountMenu :manager="manager" :last-refresh="lastRefresh" :updating="siteUpdate.running.value" @update="siteUpdate.run()" />
      </template>
    </SiteRail>
    <header v-if="!blocked" class="sticky top-0 z-20 flex h-[57px] items-center gap-1.5 border-b bg-background/95 pr-2 pl-4 backdrop-blur min-[900px]:hidden">
      <NuxtLink
        to="/?all" :aria-label="`${siteName} · ${t('nav.mySites')}`"
        class="grid size-9 flex-none place-items-center rounded-lg border border-primary text-sm font-bold text-primary"
      >{{ initial }}</NuxtLink>
      <p class="ml-1.5 min-w-0 flex-1 truncate font-semibold">{{ siteName }}</p>
      <Button type="button" variant="ghost" size="icon" :aria-label="t('basics.search.label')" @click="paletteOpen = true">
        <SearchIcon class="size-5" aria-hidden="true" />
      </Button>
      <Button v-if="viewUrl" as-child variant="ghost" size="icon">
        <a :href="viewUrl" target="_blank" rel="noopener" :aria-label="`${t('nav.viewSite')} ${t('nav.newTab')}`"><SquareArrowOutUpRightIcon class="size-5" aria-hidden="true" /></a>
      </Button>
      <AccountMenu side="bottom" :manager="manager" :last-refresh="lastRefresh" :updating="siteUpdate.running.value" @update="siteUpdate.run()" />
    </header>
    <div class="min-w-0 flex-1 min-[900px]:min-h-[calc(100dvh-2rem)] min-[900px]:rounded-2xl min-[900px]:border min-[900px]:bg-card">
      <div v-if="!blocked" class="hidden items-center gap-2.5 px-6 pt-5 min-[900px]:flex">
        <p class="min-w-0 flex-1 truncate text-[15px] font-semibold">{{ siteName }}</p>
        <Button type="button" variant="outline" class="w-56 justify-start gap-2 px-3 font-normal text-muted-foreground" @click="paletteOpen = true">
          <SearchIcon aria-hidden="true" />{{ t('basics.search.button') }}<kbd class="ml-auto rounded border bg-background px-1.5 font-sans text-[11px]">{{ shortcut }}</kbd>
        </Button>
        <Button v-if="viewUrl" as-child variant="outline">
          <a :href="viewUrl" target="_blank" rel="noopener">{{ t('nav.viewSite') }}<SquareArrowOutUpRightIcon aria-hidden="true" /><span class="sr-only"> {{ t('nav.newTab') }}</span></a>
        </Button>
      </div>
      <main id="studio-main" tabindex="-1" class="outline-none">
      <div v-if="signedOut" class="w-full max-w-[760px] px-4 pt-4 pb-30 min-[720px]:px-6 min-[720px]:pt-8 grid justify-items-start gap-3" role="alert">
        <p class="text-xl font-bold">{{ t('nav.signedOutTitle') }}</p>
        <p>{{ t('nav.signedOutText') }}</p>
        <Button as-child><NuxtLink :to="`/login?redirect=${encodeURIComponent(route.fullPath)}`">{{ t('nav.signIn') }}</NuxtLink></Button>
      </div>
      <SiteDeleting v-else-if="deletion" :slug="slug" :name="deletion.name" :at="deletion.at" />
      <div v-else-if="error" class="w-full max-w-[760px] px-4 pt-4 pb-30 min-[720px]:px-6 min-[720px]:pt-8 grid justify-items-start gap-3" role="alert">
        <p class="text-xl font-bold">{{ opErrorOf(error).message }}</p>
        <p>{{ t('nav.noAccessHelp') }}</p>
        <Button as-child variant="outline"><NuxtLink to="/?all">{{ t('nav.mySites') }}</NuxtLink></Button>
      </div>
      <slot v-else />
      </main>
    </div>
    <SiteTabBar v-if="showTabs && !blocked" class="min-[900px]:hidden" :links="links" />
    <CommandPalette
      v-model:open="paletteOpen" :slug="slug" :schema="data?.site.schema as Schema | undefined" :role="data?.role" :grants="data?.grants ?? []"
      @update="siteUpdate.run()"
    />
  </div>
</template>
