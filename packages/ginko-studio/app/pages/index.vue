<script setup lang="ts">
import { api } from '#convex/api'
import { Badge } from '@studio/components/ui/badge'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@studio/components/ui/toggle-group'

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
// The name the person's teams see instead of their email (history, conflicts, files). Saved on "Speichern".
const { mutate: setName, pending: savingName } = useConvexMutation(api.account.setName)
const { show } = useToast()
const name = ref('')
watch(() => settings.value?.name, (saved) => { name.value = saved ?? '' }, { immediate: true })
const nameChanged = computed(() => !!settings.value && name.value.trim() !== (settings.value.name ?? ''))
async function saveName() {
  problem.value = ''
  try {
    await setName({ name: name.value })
    show(t('sites.nameSaved'))
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
    <ul v-else-if="sites" class="m-0 list-none overflow-hidden rounded-xl border p-0">
      <li v-for="s in sites" :key="s.slug" class="border-b last:border-b-0">
        <NuxtLink :to="`/s/${s.slug}`" class="flex min-h-14 items-center text-foreground justify-between gap-3 px-4 py-3 font-medium outline-none transition-colors hover:bg-muted/55 focus-visible:bg-muted">
          <span>{{ s.name }}</span>
          <Badge variant="soft">{{ t(`sites.role.${s.role}`) }}</Badge>
        </NuxtLink>
      </li>
    </ul>
    <form v-if="settings" class="grid gap-2" @submit.prevent="saveName">
      <label for="own-name" class="font-medium">{{ t('sites.name') }}</label>
      <Input id="own-name" v-model="name" maxlength="60" autocomplete="name" aria-describedby="own-name-hint" />
      <p id="own-name-hint" class="text-[13px] text-muted-foreground">{{ t('sites.nameHint') }}</p>
      <Button v-if="nameChanged" type="submit" size="sm" class="justify-self-start" :disabled="savingName">{{ t('site.common.save') }}</Button>
    </form>
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
