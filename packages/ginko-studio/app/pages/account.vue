<!-- Account settings: what belongs to the person, not to a site (UI.md 2.2): the name teams see, the sign-in address,
     the Studio's language, the reminder mail, signing out, and deleting the account (a card of its own, apart from the
     rest). Reached from the account menu; needs sign-in like every page but /login and /invite. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { ArrowLeftIcon } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@studio/components/ui/select'
import { useSignOut } from '../composables/useSignOut'

definePageMeta({ topBar: true })
const { t } = useI18n()
const { locale, locales, pick } = useLocalePicker()
useHead(() => ({ title: `${t('nav.accountPage')} · Ginko` }))

const { user } = useConvexAuth()
const { data: settings } = await useConvexQuery(api.account.settings, {})
const problem = ref('')

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
    // Saved, "Speichern" goes away with the focus on it: the focus stays in the name field.
    document.getElementById('own-name')?.focus()
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

// Reminder mail (the mail before the week starts for content that is out of date) is on by default. The switch shows
// only where a site can send it to this person (a weekly task, `weekly`), so nobody switches a mail that never comes.
const { data: sites } = useConvexQuery(api.sites.mine)
const reminders = computed(() => (sites.value ?? []).some((s) => s.weekly))
const { mutate: setRemind } = useConvexMutation(api.account.setRemindByMail)
async function toggleRemind(on: boolean) {
  problem.value = ''
  try {
    await setRemind({ on })
  } catch (e) {
    problem.value = opErrorOf(e).message
  }
}

const { busy: signingOut, signOut, signOutOthers } = useSignOut()

/** One setting: its name and hint on the left, the control on the right (stacked on phones). */
const ROW = 'grid gap-3 px-4 py-4 sm:px-6 sm:py-5 min-[720px]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] min-[720px]:items-start min-[720px]:gap-8'
const HINT = 'text-[13px] text-muted-foreground'
</script>

<template>
  <main class="grid grid-cols-[minmax(0,1fr)] gap-6">
    <div class="grid gap-3">
      <NuxtLink to="/?all" class="inline-flex min-h-8 items-center gap-1.5 justify-self-start rounded-md text-sm font-medium text-muted-foreground hover:text-foreground pointer-coarse:min-h-11">
        <ArrowLeftIcon class="size-4" aria-hidden="true" />{{ t('nav.mySites') }}
      </NuxtLink>
      <div class="grid gap-1">
        <h1 class="text-[22px] font-semibold tracking-tight">{{ t('nav.accountPage') }}</h1>
        <p class="text-[15px] text-muted-foreground min-[900px]:text-sm">{{ t('account.lede') }}</p>
      </div>
    </div>
    <p v-if="problem" class="text-destructive" role="alert">{{ problem }}</p>

    <div class="divide-y rounded-xl border bg-card">
      <form v-if="settings" :class="ROW" @submit.prevent="saveName">
        <div class="grid gap-1">
          <label for="own-name" class="text-sm font-semibold">{{ t('sites.name') }}</label>
          <p id="own-name-hint" :class="HINT">{{ t('sites.nameHint') }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Input id="own-name" v-model="name" class="min-w-0 flex-1 basis-56" maxlength="60" autocomplete="name" aria-describedby="own-name-hint" />
          <Button v-if="nameChanged" type="submit" :disabled="savingName">{{ t('site.common.save') }}</Button>
        </div>
      </form>

      <div v-if="user?.email" :class="ROW">
        <div class="grid gap-1">
          <h2 class="text-sm font-semibold">{{ t('account.email') }}</h2>
          <p :class="HINT">{{ t('account.emailHint') }}</p>
        </div>
        <p class="text-sm [overflow-wrap:anywhere] min-[720px]:pt-0.5">{{ user.email }}</p>
      </div>

      <div :class="ROW">
        <div class="grid gap-1">
          <label id="language-label" for="language" class="text-sm font-semibold">{{ t('sites.language') }}</label>
          <p id="language-hint" :class="HINT">{{ t('account.languageHint') }}</p>
        </div>
        <Select :model-value="locale" @update:model-value="(code) => code && pickLocale(String(code))">
          <SelectTrigger id="language" class="h-10 w-full sm:max-w-72" aria-labelledby="language-label" aria-describedby="language-hint">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="l in locales" :key="l.code" :value="l.code" :lang="l.language" class="min-h-9 pointer-coarse:min-h-11">{{ localeLabel(l) }}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div v-if="settings && reminders" :class="ROW">
        <label for="remind" class="grid cursor-pointer gap-1">
          <strong class="text-sm font-semibold">{{ t('sites.remindTitle') }}</strong>
          <span :class="HINT">{{ t('sites.remindText') }}</span>
        </label>
        <Switch id="remind" class="min-[720px]:mt-0.5" :model-value="settings.remindByMail" @update:model-value="toggleRemind" />
      </div>

      <div :class="ROW">
        <div class="grid gap-1">
          <h2 class="text-sm font-semibold">{{ t('account.signIn') }}</h2>
          <p :class="HINT">{{ t('account.signInHint') }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button type="button" variant="outline" :disabled="signingOut" @click="signOut">{{ t('nav.signOut') }}</Button>
          <Button type="button" variant="ghost" :disabled="signingOut" @click="signOutOthers">{{ t('nav.signOutOthers') }}</Button>
        </div>
      </div>
    </div>

    <DeleteAccount />
  </main>
</template>
