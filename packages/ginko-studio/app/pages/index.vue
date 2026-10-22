<script setup lang="ts">
import { api } from '#convex/api'
import { Badge } from '@studio/components/ui/badge'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import { ChevronRightIcon, MailIcon, SearchIcon } from '@lucide/vue'
import { readRecentSites } from '../composables/useRecentEntries'
import { bySiteName, siteHost, siteMatches } from '../utils/sites'

definePageMeta({ topBar: true })
const { t, locale } = useI18n()
useHead(() => ({ title: `${t('sites.title')} · Ginko` }))

const { data: sites, error } = await useConvexQuery(api.sites.mine)
// Open invitations for the signed-in address: signing in proves it, so no link is needed.
const { data: invites } = useConvexQuery(api.invites.mine, {})
const { mutate: acceptMine } = useConvexMutation(api.invites.acceptMine)
/** Invitations being accepted, one per row: a second row's answer does not unlock the first. */
const accepting = reactive(new Set<string>())
const problem = ref('')
async function accept(invite: string) {
  accepting.add(invite)
  problem.value = ''
  try {
    const { site } = await acceptMine({ invite })
    await navigateTo(`/s/${site}`)
  } catch (e) {
    problem.value = opErrorOf(e).message
  } finally {
    accepting.delete(invite)
  }
}
// One site and nothing waiting: no list to choose from, unless the person came here on purpose ("Meine Seiten" link, `?all`).
const route = useRoute()
watchEffect(() => {
  if (route.query.all === undefined && sites.value?.length === 1 && invites.value?.length === 0) navigateTo(`/s/${sites.value[0]!.slug}`, { replace: true })
})
// An agency has dozens of sites: by name, with the address under it, a search from more than MANY, and the last three
// opened in this browser first. The role shows only where it differs between sites.
const MANY = 8
const sorted = computed(() => (sites.value ?? []).toSorted(bySiteName(locale.value)))
const many = computed(() => sorted.value.length > MANY)
const mixedRoles = computed(() => new Set(sorted.value.map((s) => s.role)).size > 1)
const search = ref('')
const searching = computed(() => many.value && !!search.value.trim())
const matching = computed(() => (searching.value ? sorted.value.filter((s) => siteMatches(s, search.value)) : sorted.value))
// The browser's memory: read once mounted, so the server and the first client render agree.
const recentSlugs = ref<string[]>([])
onMounted(() => { recentSlugs.value = readRecentSites() })
const recent = computed(() => (many.value && !searching.value ? recentSlugs.value.flatMap((slug) => sorted.value.filter((s) => s.slug === slug)) : []))
const groups = computed(() => [
  ...(recent.value.length ? [{ id: 'recent', heading: t('sites.recent'), rows: recent.value }] : []),
  { id: 'all', heading: recent.value.length ? t('sites.all') : '', rows: matching.value },
])
</script>

<template>
  <main class="grid grid-cols-[minmax(0,1fr)] gap-6">
    <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div class="grid gap-1">
        <h1 class="text-[22px] font-semibold tracking-tight">{{ t('sites.title') }}</h1>
        <p class="text-[15px] text-muted-foreground min-[900px]:text-sm">{{ t('sites.lede') }}</p>
      </div>
      <div v-if="many" class="relative w-full sm:w-64">
        <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input v-model="search" type="search" class="pl-9" :aria-label="t('sites.search')" :placeholder="t('sites.search')" />
      </div>
    </div>
    <p v-if="problem" class="text-destructive" role="alert">{{ problem }}</p>
    <section v-if="invites?.length" class="grid gap-2" aria-labelledby="invites-title">
      <h2 id="invites-title" class="text-[13px] font-medium text-muted-foreground">{{ t('sites.invites') }}</h2>
      <ul class="m-0 grid list-none gap-2 p-0">
        <li v-for="i in invites" :key="i.invite" class="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-primary/40 bg-card px-4 py-3">
          <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground" aria-hidden="true"><MailIcon class="size-4" /></span>
          <p class="min-w-0 flex-1 basis-48 text-[15px] min-[900px]:text-sm"><I18nT k="sites.invitedTo" :params="{ site: i.site, role: t(`invite.role.${i.role}`) }"><template #site="{ text }"><strong class="font-semibold">{{ text }}</strong></template></I18nT></p>
          <Button type="button" size="sm" :disabled="accepting.has(i.invite)" @click="accept(i.invite)">{{ t('sites.accept') }}</Button>
        </li>
      </ul>
    </section>
    <p v-if="error" class="text-destructive">{{ opErrorOf(error).message }}</p>
    <p v-else-if="sites && sites.length === 0 && invites?.length === 0" class="text-muted-foreground">{{ t('sites.empty') }}</p>
    <template v-else-if="sorted.length">
      <section v-for="g in groups" :key="g.id" class="grid gap-2" :aria-labelledby="g.heading ? `sites-${g.id}` : undefined">
        <h2 v-if="g.heading" :id="`sites-${g.id}`" class="text-[13px] font-medium text-muted-foreground">{{ g.heading }}</h2>
        <ul v-if="g.rows.length" class="m-0 list-none divide-y overflow-hidden rounded-xl border bg-card p-0">
          <!-- The whole row opens the site; its one link is the name, stretched over the row. -->
          <li v-for="s in g.rows" :key="s.slug" class="relative flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.03] has-[a:focus-visible]:bg-foreground/[0.03]">
            <span class="grid size-10 shrink-0 place-items-center rounded-lg border border-primary font-semibold text-primary" aria-hidden="true">{{ s.name.charAt(0).toUpperCase() }}</span>
            <span class="grid min-w-0 flex-1 gap-0.5">
              <NuxtLink :to="`/s/${s.slug}`" class="truncate font-semibold text-foreground outline-none after:absolute after:inset-0 focus-visible:after:ring-3 focus-visible:after:ring-ring/80 focus-visible:after:ring-inset min-[900px]:text-[15px]">{{ s.name }}</NuxtLink>
              <span class="truncate text-[13px] text-muted-foreground">{{ siteHost(s.url) }}</span>
            </span>
            <span v-if="s.deleting || mixedRoles" class="flex shrink-0 flex-wrap justify-end gap-1.5">
              <Badge v-if="s.deleting" variant="warning">{{ t('sites.deleting') }}</Badge>
              <Badge v-if="mixedRoles" variant="soft">{{ t(`sites.role.${s.role}`) }}</Badge>
            </span>
            <ChevronRightIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </li>
        </ul>
        <p v-else class="text-muted-foreground" role="status">{{ t('sites.noMatch', { query: search.trim() }) }}</p>
      </section>
    </template>
  </main>
</template>
