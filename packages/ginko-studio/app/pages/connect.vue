<!-- Connect a website (`ginko connect`, server connect.ts): a computer in a website folder asks for a publishing key and
     shows a code. The person types that code here (never taken from the address, so a link cannot confirm for them),
     sees which folder asks and since when, picks one site they manage, and confirms or declines. Confirming stores the
     approval; the computer's next poll gets the key. Needs sign-in like every page; the sign-in returns here. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@studio/components/ui/native-select'

definePageMeta({ topBar: true })
const { t } = useI18n()
useHead(() => ({ title: `${t('connect.title')} · Ginko` }))

const { data: sites } = useConvexQuery(api.sites.mine, {})
/** The sites whose keys this person may make: the same right as on the Team page. */
const managed = computed(() => (sites.value ?? []).filter((s) => s.role !== 'staff' && !s.deleting).sort((a, b) => a.name.localeCompare(b.name)))

const lookup = useConvexMutation(api.connect.lookup)
const approve = useConvexMutation(api.connect.approve)
const decline = useConvexMutation(api.connect.decline)

const code = ref('')
const site = ref('')
watch(managed, (list) => { if (!site.value && list.length === 1) site.value = list[0]!.slug }, { immediate: true })

/** The request the typed code names, once the server confirmed it. */
const request = ref<{ code: string; label: string; minutes: number }>()
const outcome = ref<'connected' | 'declined'>()
const problem = ref('')

/** 8 symbols, any case, with or without the hyphen: the form the server compares. */
const typed = computed(() => code.value.toUpperCase().replace(/[\s-]/g, ''))

const refusal = (reason: 'invalid' | 'limited') => t(reason === 'limited' ? 'connect.limited' : 'connect.invalid')

/** Asks the server once the code is complete; every wrong code counts against this person, so not on each key. */
async function check() {
  problem.value = ''
  request.value = undefined
  if (typed.value.length !== 8) return
  const asked = typed.value
  try {
    const answer = await lookup.mutate({ code: asked })
    if (asked !== typed.value) return
    if (!answer.ok) problem.value = refusal(answer.reason)
    else request.value = { code: asked, label: answer.label, minutes: Math.max(0, Math.floor((Date.now() - answer.startedAt) / 60_000)) }
  } catch (e) {
    problem.value = opErrorOf(e).message
  }
}
watch(typed, (now, before) => { if (now !== before && (now.length === 8 || request.value)) void check() })

async function confirm() {
  if (!request.value || !site.value) return
  problem.value = ''
  try {
    const answer = await approve.mutate({ code: request.value.code, site: site.value })
    if (answer.ok) outcome.value = 'connected'
    else { problem.value = refusal(answer.reason); request.value = undefined }
  } catch (e) {
    problem.value = opErrorOf(e).message
  }
}

async function refuse() {
  if (!request.value) return
  problem.value = ''
  try {
    const answer = await decline.mutate({ code: request.value.code })
    if (answer.ok) outcome.value = 'declined'
    else { problem.value = refusal(answer.reason); request.value = undefined }
  } catch (e) {
    problem.value = opErrorOf(e).message
  }
}

const busy = computed(() => approve.pending.value || decline.pending.value)
const ROW = 'grid gap-3 px-4 py-4 sm:px-6 sm:py-5 min-[720px]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] min-[720px]:items-start min-[720px]:gap-8'
</script>

<template>
  <main class="grid grid-cols-[minmax(0,1fr)] gap-6">
    <div class="grid gap-1">
      <h1 class="text-[22px] font-semibold tracking-tight">{{ t('connect.title') }}</h1>
      <p class="max-w-[65ch] text-[15px] text-muted-foreground min-[900px]:text-sm">{{ t('connect.lede') }}</p>
    </div>

    <p v-if="outcome" class="text-[15px] font-medium" role="status">{{ t(outcome === 'connected' ? 'connect.done' : 'connect.declined') }}</p>
    <p v-else-if="sites && !managed.length" class="text-muted-foreground">{{ t('connect.noSites') }}</p>
    <form v-else-if="sites" class="grid gap-4" novalidate @submit.prevent="confirm">
      <p v-if="problem" class="font-medium text-destructive" role="alert">{{ problem }}</p>
      <div class="divide-y rounded-xl border bg-card">
        <div :class="ROW">
          <label for="connect-code" class="text-sm font-semibold">{{ t('connect.code') }}</label>
          <div class="grid gap-1.5">
            <Input id="connect-code" v-model="code" class="max-w-[12rem] font-mono uppercase tracking-widest" maxlength="9" placeholder="XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="connect-request" @keydown.enter.prevent="check" />
            <p v-if="request" id="connect-request" class="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">{{ t('connect.request', { label: request.label, minutes: request.minutes }) }}</p>
          </div>
        </div>
        <div v-if="request" :class="ROW">
          <label for="connect-site" class="text-sm font-semibold">{{ t('connect.site') }}</label>
          <div class="grid gap-1.5">
            <NativeSelect id="connect-site" v-model="site" class="h-10 min-w-[16rem] pointer-coarse:h-11 min-[900px]:h-9 min-[900px]:text-sm">
              <NativeSelectOption v-if="managed.length > 1" value="" disabled>—</NativeSelectOption>
              <NativeSelectOption v-for="s in managed" :key="s.slug" :value="s.slug">{{ s.name }}</NativeSelectOption>
            </NativeSelect>
            <p class="text-[13px] text-muted-foreground">{{ t('connect.granted') }}</p>
          </div>
        </div>
      </div>
      <div v-if="request" class="flex flex-wrap items-center gap-3">
        <Button type="submit" :disabled="busy || !site">{{ t('connect.connect') }}</Button>
        <Button type="button" variant="outline" :disabled="busy" @click="refuse">{{ t('connect.decline') }}</Button>
      </div>
    </form>
  </main>
</template>
