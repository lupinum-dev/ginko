<!-- Mit KI verbinden (SPEC 16): a person connects their own assistant (Claude, ChatGPT, Cursor) with a key.
     The key is shown once; it acts as this person with their tasks only. Rare job, laptop: clarity over speed. -->
<script setup lang="ts">
import { CONTAINED_FIELD } from '@studio/components/fields/sizes'
import { api } from '#convex/api'
import { opErrorOf } from '../../../../composables/useOps'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'

definePageMeta({ layout: 'site', convexAuth: true })

const { t, format } = useI18n()
const s = await useSiteData()
useHead(() => ({ title: t('site.title.ai', { site: s.site.value?.name ?? t('site.fallback.site') }) }))
const { show } = useToast()
const { siteUrl } = useConvexConfig()
const endpoint = computed(() => (siteUrl ? `${siteUrl}/mcp` : ''))

const list = useConvexQuery(api.agent.keys, () => ({ site: s.slug.value }))
const keys = computed(() => list.data.value ?? [])
const createKey = useConvexMutation(api.agent.createKey)
const revokeKey = useConvexMutation(api.agent.revokeKey)

const when = (ms: number) => format.date(new Date(ms), { timeZone: s.schema.value?.timezone ?? 'Europe/Vienna', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

// Creating: a name, then the key once. Leaving the page loses it; that is said next to it.
const label = ref('Claude Code')
const creating = ref(false)
const formError = ref<string | null>(null)
const fresh = ref<{ key: string; label: string } | null>(null)

async function create() {
  formError.value = null
  creating.value = true
  try {
    const name = label.value.trim()
    const made = await createKey.mutate({ site: s.slug.value, label: name })
    fresh.value = { key: made.key, label: name }
  } catch (error) {
    formError.value = opErrorOf(error).message
  } finally {
    creating.value = false
  }
}

const claudeLine = computed(() => fresh.value ? `claude mcp add --transport http ginko ${endpoint.value} --header "Authorization: Bearer ${fresh.value.key}"` : '')

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text)
    show(done)
  } catch {
    show(t('site.ai.copyFailed'))
  }
}

// Revoking asks once, in the row (UI.md: destructive actions say what happens).
const confirming = ref<string | null>(null)
const rowError = ref<{ id: string; message: string } | null>(null)
async function revoke(id: string) {
  rowError.value = null
  try {
    await revokeKey.mutate({ site: s.slug.value, key: id })
    confirming.value = null
  } catch (error) {
    rowError.value = { id, message: opErrorOf(error).message }
  }
}
</script>

<template>
  <main class="w-full max-w-[760px] px-4 pt-4 pb-30 min-[720px]:px-6 min-[720px]:pt-8">
    <h1 class="text-xl font-semibold tracking-tight">{{ t('site.ai.heading') }}</h1>
    <p class="mt-1 max-w-[60ch] text-[13px] text-muted-foreground">
      {{ t('site.ai.lead', { first: t('site.ai.exampleOne'), second: t('site.ai.exampleTwo') }) }}
    </p>

    <section v-if="fresh" class="mt-6 grid gap-3 rounded-xl border border-primary bg-card p-4" aria-labelledby="fresh-title">
      <h2 id="fresh-title" class="text-base font-semibold tracking-tight">{{ t('site.ai.keyFor', { label: fresh.label }) }}</h2>
      <p class="rounded-md bg-warning/12 px-3 py-2.5 font-medium">{{ t('site.ai.keyOnce') }}</p>

      <div class="grid gap-2">
        <p class="text-sm font-medium">{{ t('site.ai.terminal') }}</p>
        <pre class="m-0 select-all whitespace-pre-wrap rounded-md border bg-muted px-3 py-2.5 text-sm [overflow-wrap:anywhere]">{{ claudeLine }}</pre>
        <div class="flex flex-wrap gap-2"><Button type="button" size="sm" @click="copy(claudeLine, t('site.ai.copiedCommand'))">{{ t('site.ai.copyCommand') }}</Button></div>
      </div>

      <details class="grid gap-3 [&[open]]:gap-3">
        <summary class="flex min-h-11 cursor-pointer items-center text-sm font-medium">{{ t('site.ai.other') }}</summary>
        <div class="grid gap-2">
          <p class="text-sm font-medium">{{ t('site.ai.address') }}</p>
          <pre class="m-0 select-all whitespace-pre-wrap rounded-md border bg-muted px-3 py-2.5 text-sm [overflow-wrap:anywhere]">{{ endpoint }}</pre>
          <div class="flex flex-wrap gap-2"><Button type="button" variant="secondary" size="sm" @click="copy(endpoint, t('site.ai.copiedAddress'))">{{ t('site.ai.copyAddress') }}</Button></div>
        </div>
        <div class="grid gap-2">
          <p class="text-sm font-medium">{{ t('site.ai.authHeader') }}</p>
          <pre class="m-0 select-all whitespace-pre-wrap rounded-md border bg-muted px-3 py-2.5 text-sm [overflow-wrap:anywhere]">Bearer {{ fresh.key }}</pre>
          <div class="flex flex-wrap gap-2"><Button type="button" variant="secondary" size="sm" @click="copy(`Bearer ${fresh.key}`, t('site.ai.copiedKey'))">{{ t('site.ai.copyKey') }}</Button></div>
        </div>
      </details>

      <div class="flex flex-wrap gap-2"><Button type="button" variant="secondary" size="sm" @click="fresh = null">{{ t('site.common.done') }}</Button></div>
    </section>

    <section v-else class="mt-6 grid gap-3" aria-labelledby="new-title">
      <h2 id="new-title" class="text-base font-semibold tracking-tight">{{ t('site.ai.newKey') }}</h2>
      <form class="grid max-w-lg gap-3" @submit.prevent="create">
        <div class="grid gap-1.5">
          <div :class="CONTAINED_FIELD">
            <label for="key-label" class="text-xs leading-snug font-medium text-muted-foreground">{{ t('site.ai.forWhich') }}</label>
            <Input id="key-label" v-model="label" maxlength="60" required :aria-invalid="!!formError" aria-describedby="key-label-hint" />
          </div>
          <p id="key-label-hint" class="text-[13px] text-muted-foreground">{{ t('site.ai.labelHint') }}</p>
        </div>
        <p v-if="formError" class="font-semibold text-destructive" role="alert">{{ formError }}</p>
        <div class="flex flex-wrap gap-2"><Button type="submit" :disabled="creating">{{ t('site.ai.createKey') }}</Button></div>
      </form>
    </section>

    <section class="mt-6 grid gap-3" aria-labelledby="keys-title">
      <h2 id="keys-title" class="text-base font-semibold tracking-tight">{{ t('site.ai.yourKeys') }}</h2>
      <p v-if="!keys.length" class="text-[13px] text-muted-foreground">{{ t('site.ai.noneYet') }}</p>
      <ul v-else class="m-0 list-none overflow-hidden rounded-xl border p-0">
        <li v-for="k in keys" :key="k.id" :class="['grid gap-2 border-b px-4 py-3 last:border-b-0', { 'opacity-65': k.revokedAt }]">
          <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div class="grid min-w-0 gap-0.5">
              <p class="font-medium [overflow-wrap:anywhere]">{{ k.label }}</p>
              <p class="text-[13px] text-muted-foreground">
                {{ t('site.ai.createdAt', { when: when(k.createdAt) }) }}<template v-if="k.revokedAt">{{ t('site.ai.revokedAt', { when: when(k.revokedAt) }) }}</template><template v-else>{{ k.lastUsedAt ? t('site.ai.lastUsedAt', { when: when(k.lastUsedAt) }) : t('site.ai.neverUsed') }}</template>
              </p>
            </div>
            <Button v-if="!k.revokedAt && confirming !== k.id" type="button" variant="ghost" size="sm" class="text-destructive hover:text-destructive" @click="confirming = k.id">{{ t('site.ai.revokeKey') }}</Button>
          </div>
          <div v-if="!k.revokedAt && confirming === k.id" class="grid gap-2 rounded-md bg-warning/12 px-3 py-2.5">
            <p>{{ t('site.ai.revokeConfirm', { label: k.label }) }}</p>
            <div class="flex flex-wrap gap-2">
              <Button type="button" variant="destructive" size="sm" @click="revoke(k.id)">{{ t('site.ai.revokeKey') }}</Button>
              <Button type="button" variant="ghost" size="sm" @click="confirming = null">{{ t('site.common.cancel') }}</Button>
            </div>
          </div>
          <p v-if="rowError?.id === k.id" class="font-semibold text-destructive" role="alert">{{ rowError.message }}</p>
        </li>
      </ul>
    </section>
  </main>
</template>
