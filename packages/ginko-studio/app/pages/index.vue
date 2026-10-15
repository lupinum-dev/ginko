<script setup lang="ts">
import { api } from '#convex/api'
import { Badge } from '@studio/components/ui/badge'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@studio/components/ui/toggle-group'
import { readRecentSites } from '../composables/useRecentEntries'
import { bySiteName, siteHost, siteMatches } from '../utils/sites'

const { t } = useI18n()
const { locale, locales, pick } = useLocalePicker()
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
// Reminder mail (the mail before the week starts for content that is out of date) is on by default.
const { data: settings } = useConvexQuery(api.account.settings, {})
const { mutate: setRemind } = useConvexMutation(api.account.setRemindByMail)
async function toggleRemind(on: boolean) {
  problem.value = ''
  try {
    await setRemind({ on })
  } catch (e) {
    problem.value = opErrorOf(e).message
  }
}
async function pickLocale(code: string) {
  problem.value = ''
  try {
    await pick(code)
  } catch (e) {
    problem.value = opErrorOf(e).message
  }
}
</script>

<template>
  <main class="mx-auto grid w-full max-w-sm gap-5 rounded-2xl border bg-card p-6 sm:p-8">
    <h1 class="text-xl font-semibold tracking-tight">{{ t('sites.title') }}</h1>
    <p v-if="problem" class="text-destructive" role="alert">{{ problem }}</p>
    <ul v-if="invites?.length" class="m-0 list-none overflow-hidden rounded-xl border border-primary p-0">
      <li v-for="i in invites" :key="i.invite" class="grid gap-2.5 border-b px-4 py-3 last:border-b-0">
        <p><I18nT k="sites.invitedTo" :params="{ site: i.site, role: t(`invite.role.${i.role}`) }"><template #site="{ text }"><strong class="font-medium">{{ text }}</strong></template></I18nT></p>
        <Button type="button" size="sm" class="justify-self-start" :disabled="accepting.has(i.invite)" @click="accept(i.invite)">{{ t('sites.accept') }}</Button>
      </li>
    </ul>
    <p v-if="error" class="text-destructive">{{ opErrorOf(error).message }}</p>
    <p v-else-if="sites && sites.length === 0 && invites?.length === 0" class="text-muted-foreground">{{ t('sites.empty') }}</p>
    <template v-else-if="sorted.length">
      <Input v-if="many" v-model="search" type="search" :aria-label="t('sites.search')" :placeholder="t('sites.search')" />
      <section v-for="g in groups" :key="g.id" class="grid gap-2" :aria-labelledby="g.heading ? `sites-${g.id}` : undefined">
        <h2 v-if="g.heading" :id="`sites-${g.id}`" class="text-[13px] font-medium text-muted-foreground">{{ g.heading }}</h2>
        <ul v-if="g.rows.length" class="m-0 list-none overflow-hidden rounded-xl border p-0">
          <li v-for="s in g.rows" :key="s.slug" class="border-b last:border-b-0">
            <NuxtLink :to="`/s/${s.slug}`" class="flex min-h-14 items-center text-foreground justify-between gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/55 focus-visible:bg-muted">
              <span class="grid min-w-0 gap-0.5">
                <span class="truncate font-medium">{{ s.name }}</span>
                <span class="truncate text-[13px] text-muted-foreground">{{ siteHost(s.url) }}</span>
              </span>
              <span v-if="s.deleting || mixedRoles" class="flex shrink-0 flex-wrap justify-end gap-1.5">
                <Badge v-if="s.deleting" variant="warning">{{ t('sites.deleting') }}</Badge>
                <Badge v-if="mixedRoles" variant="soft">{{ t(`sites.role.${s.role}`) }}</Badge>
              </span>
            </NuxtLink>
          </li>
        </ul>
        <p v-else class="text-muted-foreground" role="status">{{ t('sites.noMatch', { query: search.trim() }) }}</p>
      </section>
    </template>
    <div v-if="settings" class="flex items-start gap-3.5">
      <Switch id="remind" class="mt-0.5" :model-value="settings.remindByMail" @update:model-value="toggleRemind" />
      <label for="remind" class="grid cursor-pointer gap-0.5">
        <strong class="font-medium">{{ t('sites.remindTitle') }}</strong>
        <span class="text-[13px] text-muted-foreground">{{ t('sites.remindText') }}</span>
      </label>
    </div>
    <div class="grid gap-2" role="group" aria-labelledby="language-label">
      <strong id="language-label" class="font-medium">{{ t('sites.language') }}</strong>
      <ToggleGroup type="single" variant="segmented" aria-labelledby="language-label" :model-value="locale" @update:model-value="(code) => code && pickLocale(code as string)">
        <ToggleGroupItem v-for="l in locales" :key="l.code" :value="l.code" :lang="l.language" class="px-3">{{ localeLabel(l) }}</ToggleGroupItem>
      </ToggleGroup>
    </div>
    <DeleteAccount />
    <SignOut />
  </main>
</template>
