<!-- Pages of one site: its name, "View site", the views (UI.md 2, 10.2). -->
<script setup lang="ts">
import { api } from '#convex/api'
import { DEFAULT_WEEK, type ComponentRegistry, type Schema } from '@lupinum/ginko/internal'
import { provideGinkoAssets } from '@lupinum/ginko-editor'
import { ChevronRightIcon, CircleCheckIcon, FileTextIcon, HistoryIcon, ImageIcon, SearchIcon, SparklesIcon, SquareArrowOutUpRightIcon, SunIcon, UsersIcon } from '@lucide/vue'
import { isSiteLinkActive, type SiteLink } from '../utils/siteLinks'
import { useBottomBar } from '../composables/useBottomBar'
import { EDITOR_COMPONENTS, EDITOR_LINK_TARGETS } from '@studio/components/editor/context'
import { provideStudioSite } from '../utils/labels'
import { provideEditorFacts } from '../composables/useFacts'
import { localDraftKeys } from '../composables/useLocalDraft'
import { rememberSite } from '../composables/useRecentEntries'
import { isModKey } from '../utils/keys'
import { provideCrumbs, providePanelBar, type Crumb } from '../composables/usePageHeader'

const route = useRoute()
const { t, format } = useI18n()
const slug = computed(() => String(route.params.site))
// Every form under this layout (Schnell ändern, Alles bearbeiten) uploads to this site.
provideGinkoAssets(useConvexGinkoAssets(slug))
const { data, error } = useConvexQuery(api.sites.meta, () => ({ site: slug.value }))
// "Meine Seiten" lists the sites opened last in this browser first. Only a site that answered counts, so a mistyped
// address or a site the person was removed from does not push real ones out (storage exists in the browser only).
watch(() => data.value?.site.slug, (opened) => { if (opened) rememberSite(opened) }, { immediate: true })
// A site whose deletion has started opens for nothing but cancelling it (`sites.meta` is refused for everyone then).
const { data: deletion } = useConvexQuery(api.sites.deletion, () => ({ site: slug.value }))
// The slash menu of Markdown fields offers the components of this site's schema.
provide(EDITOR_COMPONENTS, () => (data.value?.site.schema as { components?: ComponentRegistry } | undefined)?.components)
// Fact chips in those fields show what the website shows there (facts.values, per language of the text).
provideEditorFacts(() => slug.value, () => (data.value?.site.schema as { components?: ComponentRegistry } | undefined)?.components)
// Their link dialog offers the site's own pages: the static ones and the entries of collections with a page.
provide(EDITOR_LINK_TARGETS, () => {
  const schema = data.value?.site.schema as Schema | undefined
  return schema && { pages: schema.pages, routed: Object.entries(schema.bricks).filter(([, b]) => b.kind === 'collection' && !!b.route).map(([key]) => key) }
})
// Labels and prices under this layout read the site's main language and currency.
provideStudioSite({ main: () => data.value?.site.schema.locales[0] ?? '', currency: () => data.value?.site.schema.currency ?? 'EUR', timeZone: () => data.value?.site.schema.timeZone ?? 'Europe/Vienna' })
// Date fields under this layout count "today" and weeks in the site's zone and week (`schema.week`).
provide('ginko:timeZone', computed(() => data.value?.site.schema.timeZone ?? 'Europe/Vienna'))
// While the site loads there is no schema yet.
provide('ginko:week', computed(() => data.value?.site.schema.week ?? DEFAULT_WEEK))
// Only a refusal replaces the page: signed out (in another tab, or the session ended on the server, which leaves the
// token here, so only the server's answer tells, auth-1), no access (removed from the team, an unknown site), or the
// site being deleted. Then no page, sheet or button stays usable (break-it 9); the page says what happened and what to
// do, and the unsaved input of an open form stays in this browser. A failure (a timeout, a reconnect burst, a deploy)
// keeps the last answer and the open form: better-convex keeps the last data on an error, the server checks every
// write, and the next write anywhere on the site runs this query again, which clears the error.
const { status, user } = useConvexAuth()
const signedOut = computed(() => status.value === 'anonymous' || isSignInRequired(error.value))
const noAccess = computed(() => !signedOut.value && isNoAccess(error.value))
// A member removed while typing learns that her unsaved input is not online and comes back in this browser if she is
// invited again. The open form writes its copy while it unmounts, in the render that shows the access page, so the
// check waits a tick; storage exists only in the browser, so a page that opens without access checks once mounted,
// and again when the person is known (she may still be loading then).
const unsavedHere = ref(false)
const checkUnsaved = () => {
  const id = user.value?.id
  unsavedHere.value = noAccess.value && !!id && localDraftKeys(id, slug.value).length > 0
}
watch([noAccess, () => user.value?.id], () => nextTick(checkUnsaved))
onMounted(checkUnsaved)
/** A failure with no last answer: nothing is open yet, so a reload loses nothing. */
const notLoaded = computed(() => !!error.value && !data.value && !signedOut.value && !noAccess.value)
// `force`: a second try within Nuxt's 10 s guard must reload too.
const reload = () => reloadNuxtApp({ force: true })
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
  if (isModKey(event, 'k')) {
    event.preventDefault()
    paletteOpen.value = !paletteOpen.value
  }
}
onMounted(() => {
  apple.value = /Mac|iPhone|iPad/.test(navigator.platform)
  window.addEventListener('keydown', onShortcut)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onShortcut))
// "Update website now" for owner and admin, with "Last update" under it (`sites.meta` `lastRefreshAt`).
const siteUpdate = useUpdateSite(() => slug.value)
const lastRefresh = computed(() => data.value?.site.lastRefreshAt)
const base = computed(() => `/s/${slug.value}`)
const links = computed<SiteLink[]>(() => [
  { to: base.value, label: t('nav.quick'), icon: SunIcon, exact: true },
  { to: `${base.value}/all`, label: t('nav.all'), icon: FileTextIcon },
  ...(manager.value ? [{ to: `${base.value}/review`, label: t('nav.review'), icon: CircleCheckIcon, count: toReview.value || undefined }] : []),
  { to: `${base.value}/files`, label: t('nav.files'), icon: ImageIcon },
  { to: `${base.value}/history`, label: t('nav.history'), icon: HistoryIcon },
  ...(manager.value ? [{ to: `${base.value}/team`, label: t('nav.team'), icon: UsersIcon }] : []),
  { to: `${base.value}/ai`, label: t('nav.ai'), icon: SparklesIcon },
])
const siteName = computed(() => data.value?.site.name ?? '…')
// The panel's top bar: the site name, then the crumbs of the open page, or the word of its view (D26).
const pageCrumbs = provideCrumbs()
const crumbs = computed<Crumb[]>(() => {
  const own = pageCrumbs.value
  if (own?.length) return own
  const view = [...links.value].reverse().find((l) => isSiteLinkActive(route.path, l))
  return view ? [{ label: view.label }] : []
})
// Wide screens: the canvas colour behind the rail and the panel also covers the overscroll area.
useHead({ bodyAttrs: { class: 'studio-site' } })
const initial = computed(() => (data.value?.site.name ?? '').trim().charAt(0).toUpperCase() || '·')
// The entry editor has its own bar at the bottom (save), so phones show no tab bar while one is open.
const bottomBar = useBottomBar()
const showTabs = computed(() => bottomBar.value === 0)
// Signed out, no access or not loaded: no site to navigate, so no rail, bars or site name (the message offers the way out).
const blocked = computed(() => signedOut.value || noAccess.value || notLoaded.value || !!deletion.value)
// The wide top bar shows with the site; pages teleport their actions into it while it does.
providePanelBar(() => !blocked.value)
/** The frame of the signed-out, no-access and not-loaded messages: the page frame's width and padding (StudioPage). */
const BLOCKED = 'grid w-full max-w-[1200px] justify-items-start gap-3 px-4 pt-4 min-[900px]:px-8 min-[900px]:pt-7'
</script>

<template>
  <!-- Wide screens: the rail on the canvas, the page in a framed panel whose top bar sticks (site, crumbs, page actions,
       search, View site). Phones: a top bar, the page, tabs at the bottom. --studio-header-height is what sticks above
       the page, so sticky toolbars and panes sit below it. -->
  <div class="min-h-dvh [--studio-header-height:57px] min-[900px]:flex min-[900px]:gap-3 min-[900px]:bg-canvas min-[900px]:p-3 min-[900px]:[--studio-header-height:3.5rem]">
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
    <!-- overflow-clip rounds the panel without making it a scroll container, so the top bar still sticks to the window. -->
    <div class="min-w-0 flex-1 min-[900px]:flex min-[900px]:min-h-[calc(100dvh-1.5rem)] min-[900px]:flex-col min-[900px]:overflow-clip min-[900px]:rounded-xl min-[900px]:border min-[900px]:bg-card min-[900px]:shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
      <header v-if="!blocked" class="sticky top-0 z-20 hidden h-14 items-center gap-2 border-b bg-card/95 pr-3 pl-5 backdrop-blur-sm min-[900px]:flex">
        <div id="studio-lead" class="flex items-center empty:hidden" />
        <nav :aria-label="t('nav.crumbs')" class="min-w-0 flex-1 overflow-x-clip">
          <ol class="flex min-w-0 items-center gap-1 text-sm">
            <li class="flex min-w-0 shrink-0 items-center">
              <NuxtLink :to="base" class="truncate rounded-md px-1 py-0.5 text-muted-foreground no-underline hover:text-foreground">{{ siteName }}</NuxtLink>
            </li>
            <li v-for="(c, i) in crumbs" :key="i" :class="['flex min-w-0 items-center gap-1', i < crumbs.length - 1 && 'shrink-0']">
              <ChevronRightIcon class="size-3.5 flex-none text-muted-foreground/70" aria-hidden="true" />
              <NuxtLink v-if="c.to && i < crumbs.length - 1" :to="c.to" class="truncate rounded-md px-1 py-0.5 text-muted-foreground no-underline hover:text-foreground">{{ c.label }}</NuxtLink>
              <span v-else class="truncate px-1 font-medium" :aria-current="i === crumbs.length - 1 ? 'page' : undefined">{{ c.label }}</span>
            </li>
          </ol>
        </nav>
        <div id="studio-actions" class="flex min-w-0 items-center gap-2 empty:hidden" />
        <Button type="button" variant="ghost" class="h-9 gap-2 px-2.5 font-normal text-muted-foreground min-[1280px]:w-52 min-[1280px]:justify-start min-[1280px]:border min-[1280px]:bg-background" :aria-label="t('basics.search.label')" @click="paletteOpen = true">
          <SearchIcon aria-hidden="true" /><span class="hidden min-[1280px]:inline">{{ t('basics.search.button') }}</span><kbd class="ml-auto hidden rounded border bg-muted px-1.5 font-sans text-[11px] min-[1280px]:inline">{{ shortcut }}</kbd>
        </Button>
        <Button v-if="viewUrl" as-child variant="ghost" class="h-9 gap-2 px-2.5">
          <a :href="viewUrl" target="_blank" rel="noopener"><span class="hidden min-[1100px]:inline">{{ t('nav.viewSite') }}</span><SquareArrowOutUpRightIcon aria-hidden="true" /><span class="sr-only"><span class="min-[1100px]:hidden">{{ t('nav.viewSite') }}</span> {{ t('nav.newTab') }}</span></a>
        </Button>
      </header>
      <!-- The phone tab bar is fixed over the end of the page: every page ends 7.5rem (pb-30) above the bottom, so its last
           button ("weitere anzeigen") stays tappable. The entry editor brings its own sticky bar instead of the tab bar.
           Wide screens have no tab bar: each page ends with its own bottom padding. -->
      <main id="studio-main" tabindex="-1" :class="['outline-none min-[900px]:flex min-[900px]:flex-1 min-[900px]:flex-col min-[900px]:pb-0', showTabs ? 'pb-30' : 'pb-6']">
      <div v-if="signedOut" :class="BLOCKED" role="alert">
        <p class="text-xl font-bold">{{ t('errors.signedOut') }}</p>
        <!-- A full page load: the server checks the session, where the client may still think it is signed in. -->
        <Button as-child><NuxtLink :to="`/login?redirect=${encodeURIComponent(route.fullPath)}`" external>{{ t('nav.signIn') }}</NuxtLink></Button>
      </div>
      <SiteDeleting v-else-if="deletion" :slug="slug" :name="deletion.name" :at="deletion.at" />
      <div v-else-if="noAccess" :class="BLOCKED" role="alert">
        <p class="text-xl font-bold">{{ opErrorOf(error).message }}</p>
        <p v-if="unsavedHere">{{ t('nav.noAccessUnsaved') }}</p>
        <p>{{ t('nav.noAccessHelp') }}</p>
        <Button as-child variant="outline"><NuxtLink to="/?all">{{ t('nav.mySites') }}</NuxtLink></Button>
      </div>
      <div v-else-if="notLoaded" :class="BLOCKED" role="alert">
        <p class="text-xl font-bold">{{ t('basics.notLoaded') }}</p>
        <div class="flex flex-wrap gap-2">
          <Button type="button" @click="reload">{{ t('basics.retry') }}</Button>
          <Button as-child variant="outline"><NuxtLink to="/?all">{{ t('nav.mySites') }}</NuxtLink></Button>
        </div>
      </div>
      <template v-else>
        <!-- Above every page, so every role sees it (a manager without tasks never sees Schnell ändern). -->
        <!-- Lined up with the page frame (StudioPage: 1200px with 2rem padding, centred). -->
        <StorageNotice v-if="data" class="mx-4 mt-4 min-[900px]:mt-6 min-[900px]:mx-[max(2rem,calc((100%-1136px)/2))]" :slug="slug" :bytes="data.site.bytes" :entry-count="data.site.entryCount" :manager="manager" />
        <slot />
      </template>
      </main>
    </div>
    <SiteTabBar v-if="showTabs && !blocked" class="min-[900px]:hidden" :links="links" />
    <CommandPalette
      v-model:open="paletteOpen" :slug="slug" :schema="data?.site.schema as Schema | undefined" :role="data?.role" :grants="data?.grants ?? []"
      @update="siteUpdate.run()"
    />
  </div>
</template>
