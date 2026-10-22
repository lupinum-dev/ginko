<!-- Mit KI verbinden (SPEC 16): a person connects their own assistant (Claude, ChatGPT, Cursor) with a key.
     The key is shown once; it acts as this person with their tasks only. Rare job, laptop: clarity over speed. From
     1100px the form and the keys are on the left, how it works and the new key on the right; on a phone the new key
     comes first, where the form was. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { nextTick } from 'vue'
import { opErrorOf } from '../../../../composables/useOps'
import { shownLabel } from '../../../../utils/labels'
import { whenText } from '../../../../utils/when'
import StudioPage from '../../../../components/StudioPage.vue'
import { Button } from '@studio/components/ui/button'
import { CircleCheckIcon, CopyIcon, HistoryIcon, KeyRoundIcon, PlugIcon, ShieldCheckIcon } from '@lucide/vue'
import { Input } from '@studio/components/ui/input'

definePageMeta({ layout: 'site' })

const { t, format } = useI18n()
const s = await useSiteData()
useHead(() => ({ title: t('site.title.ai', { site: s.site.value?.name ?? t('site.fallback.site') }) }))
const { show } = useToast()
const { siteUrl } = useConvexConfig()
const endpoint = computed(() => (siteUrl ? `${siteUrl}/mcp` : ''))

const list = useConvexQuery(api.agent.keys, () => ({ site: s.slug.value }))
// Keys in use first; revoked ones stay below for the record.
const keys = computed(() => [...(list.data.value ?? [])].sort((a, b) => Number(!!a.revokedAt) - Number(!!b.revokedAt)))
const createKey = useConvexMutation(api.agent.createKey)
const revokeKey = useConvexMutation(api.agent.revokeKey)

const when = (ms: number) => whenText(ms, s.schema.value?.timeZone ?? 'Europe/Vienna', format)

// The lead's two examples are tasks the person may do on this site, creating and editing first; a site with fewer than
// two gets a generic pair. No fixed example names one kind of site's content (a lunch menu on an agency site).
const examples = computed(() => {
  const tasks = s.bricks.value.flatMap(([key, brick]) => (brick.tasks ?? []).filter((task) => s.may(key, task)))
  const [first, second] = new Set(tasks.toSorted((a, b) => Number(a.kind === 'remove') - Number(b.kind === 'remove')).map((task) => shownLabel(task.label, s.main.value)))
  return first && second ? { first, second } : { first: t('site.ai.exampleOne'), second: t('site.ai.exampleTwo') }
})
// Whether a key's changes wait for approval (SPEC 17). With review off it acts like the person: what waits for
// approval when she does it (staff tasks with needsApproval) waits for the key too.
const waitsForSome = computed(() => s.role.value === 'staff' && s.bricks.value.some(([key, brick]) => (brick.tasks ?? []).some((task) => task.needsApproval && s.may(key, task))))
const reviewText = (review: boolean) => t(review ? 'site.ai.reviewOn' : waitsForSome.value ? 'site.ai.reviewLikeYou' : 'site.ai.reviewOff')

// Creating: a name, then the key once. Leaving the page loses it; that is said next to it.
const label = ref('Claude Code')
const formError = ref<string | null>(null)
const fresh = ref<{ key: string; label: string } | null>(null)

// The form and the new key's panel replace each other: the focus follows to what comes next.
const copyCommandButton = ref<{ $el: HTMLElement } | null>(null)

async function create() {
  formError.value = null
  try {
    const name = label.value.trim()
    const made = await createKey.mutate({ site: s.slug.value, label: name })
    fresh.value = { key: made.key, label: name }
    await nextTick()
    copyCommandButton.value?.$el.focus()
  } catch (error) {
    formError.value = opErrorOf(error).message
  }
}

async function done() {
  fresh.value = null
  await nextTick()
  document.getElementById('key-label')?.focus()
}

/** What a key does, said before one exists (the lead names the tasks). */
const how = computed(() => [
  { icon: ShieldCheckIcon, text: t('site.ai.how.tasks') },
  { icon: HistoryIcon, text: t('site.ai.how.history') },
  { icon: CircleCheckIcon, text: t('site.ai.how.review') },
  { icon: PlugIcon, text: t('site.ai.how.assistants') },
])

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
  <StudioPage :title="t('nav.ai')" :lede="t('site.ai.lead', examples)">
    <!-- Two stacks from 1100px; below, both wrappers dissolve so the new key can move to the top. -->
    <div class="flex flex-col gap-6 min-[1100px]:grid min-[1100px]:grid-cols-[minmax(0,1fr)_20rem] min-[1100px]:items-start min-[1100px]:gap-8">
      <div class="contents min-[1100px]:grid min-[1100px]:min-w-0 min-[1100px]:gap-6">
        <section v-if="!fresh" class="overflow-hidden rounded-xl border bg-card" aria-labelledby="new-title">
          <h2 id="new-title" class="px-4 pt-3 text-[15px] font-semibold tracking-tight">{{ t('site.ai.newKey') }}</h2>
          <form class="grid gap-3 p-4 pt-3" @submit.prevent="create">
            <div class="grid max-w-md gap-1.5">
              <label for="key-label" class="text-sm leading-snug font-medium">{{ t('site.ai.forWhich') }}</label>
              <Input id="key-label" v-model="label" maxlength="60" required :aria-invalid="!!formError" aria-describedby="key-label-hint" />
              <p id="key-label-hint" class="text-[13px] text-muted-foreground">{{ t('site.ai.labelHint') }}</p>
            </div>
            <p v-if="formError" class="font-semibold text-destructive" role="alert">{{ formError }}</p>
            <div class="flex flex-wrap gap-2"><Button type="submit" :disabled="createKey.pending.value">{{ t('site.ai.createKey') }}</Button></div>
          </form>
        </section>

        <section class="order-1 overflow-hidden rounded-xl border bg-card min-[1100px]:order-none" aria-labelledby="keys-title">
          <h2 id="keys-title" class="border-b px-4 py-3 text-[15px] font-semibold tracking-tight">{{ t('site.ai.yourKeys') }}</h2>
          <p v-if="!keys.length" class="px-4 py-3 text-[13px] text-muted-foreground">{{ t('site.ai.noneYet') }}</p>
          <ul v-else class="m-0 list-none divide-y p-0">
            <li v-for="k in keys" :key="k.id" :class="['grid gap-2 px-4 py-3', { 'opacity-65': k.revokedAt }]">
              <div class="flex items-start gap-3">
                <KeyRoundIcon class="mt-0.5 size-4 flex-none text-muted-foreground" aria-hidden="true" />
                <div class="grid min-w-0 flex-1 gap-0.5">
                  <p class="font-medium [overflow-wrap:anywhere] min-[900px]:text-sm">{{ k.label }}</p>
                  <p class="text-[13px] text-muted-foreground tabular-nums">
                    {{ t('site.keys.createdAt', { when: when(k.createdAt) }) }}<template v-if="k.revokedAt">{{ t('site.ai.revokedAt', { when: when(k.revokedAt) }) }}</template><template v-else>{{ k.lastUsedAt ? t('site.keys.lastUsedAt', { when: when(k.lastUsedAt) }) : t('site.keys.neverUsed') }}</template>
                  </p>
                  <p v-if="!k.revokedAt" class="text-[13px] text-muted-foreground">{{ reviewText(k.reviewEffective) }}</p>
                </div>
                <Button v-if="!k.revokedAt && confirming !== k.id" type="button" variant="ghost" size="sm" class="-my-1 -mr-2 flex-none text-destructive hover:text-destructive" @click="confirming = k.id">{{ t('site.keys.revoke') }}</Button>
              </div>
              <div v-if="!k.revokedAt && confirming === k.id" class="grid gap-2 rounded-lg bg-warning/12 px-3 py-2.5 min-[640px]:ml-7">
                <p class="text-sm">{{ t('site.ai.revokeConfirm', { label: k.label }) }}</p>
                <div class="flex flex-wrap gap-2">
                  <Button type="button" variant="destructive" size="sm" :disabled="revokeKey.pending.value" @click="revoke(k.id)">{{ t('site.keys.revoke') }}</Button>
                  <Button type="button" variant="ghost" size="sm" @click="confirming = null">{{ t('site.common.cancel') }}</Button>
                </div>
              </div>
              <p v-if="rowError?.id === k.id" class="font-semibold text-destructive" role="alert">{{ rowError.message }}</p>
            </li>
          </ul>
        </section>
      </div>

      <div class="contents min-[1100px]:grid min-[1100px]:min-w-0 min-[1100px]:gap-4">
        <!-- The new key, once: leaving the page or "Fertig" loses it. -->
        <section v-if="fresh" class="-order-1 grid gap-4 rounded-xl border border-primary/40 bg-card p-4 min-[1100px]:order-none" aria-labelledby="fresh-title">
          <div class="grid gap-2">
            <h2 id="fresh-title" class="text-[15px] font-semibold tracking-tight [overflow-wrap:anywhere]">{{ t('site.ai.keyFor', { label: fresh.label }) }}</h2>
            <p class="rounded-lg bg-warning/12 px-3 py-2 text-[13px] font-medium">{{ t('site.ai.keyOnce') }}</p>
          </div>

          <div class="grid gap-2">
            <p class="text-sm font-medium">{{ t('site.ai.terminal') }}</p>
            <pre class="m-0 select-all whitespace-pre-wrap rounded-md bg-muted px-3 py-2 font-mono text-[13px] [overflow-wrap:anywhere]">{{ claudeLine }}</pre>
            <Button ref="copyCommandButton" type="button" size="sm" class="justify-self-start" @click="copy(claudeLine, t('site.ai.copiedCommand'))"><CopyIcon aria-hidden="true" />{{ t('site.ai.copyCommand') }}</Button>
          </div>

          <details class="group grid gap-3 border-t pt-1">
            <summary class="flex min-h-11 cursor-pointer items-center text-sm font-medium min-[900px]:min-h-9 pointer-coarse:min-h-11">{{ t('site.ai.other') }}</summary>
            <div class="grid gap-3">
              <div class="grid gap-2">
                <p class="text-sm font-medium">{{ t('site.ai.address') }}</p>
                <pre class="m-0 select-all whitespace-pre-wrap rounded-md bg-muted px-3 py-2 font-mono text-[13px] [overflow-wrap:anywhere]">{{ endpoint }}</pre>
                <Button type="button" variant="outline" size="sm" class="justify-self-start" @click="copy(endpoint, t('site.ai.copiedAddress'))"><CopyIcon aria-hidden="true" />{{ t('site.ai.copyAddress') }}</Button>
              </div>
              <div class="grid gap-2">
                <p class="text-sm font-medium">{{ t('site.ai.authHeader') }}</p>
                <pre class="m-0 select-all whitespace-pre-wrap rounded-md bg-muted px-3 py-2 font-mono text-[13px] [overflow-wrap:anywhere]">Bearer {{ fresh.key }}</pre>
                <Button type="button" variant="outline" size="sm" class="justify-self-start" @click="copy(`Bearer ${fresh.key}`, t('site.ai.copiedKey'))"><CopyIcon aria-hidden="true" />{{ t('site.ai.copyKey') }}</Button>
              </div>
            </div>
          </details>

          <Button type="button" variant="outline" size="sm" class="justify-self-start" @click="done">{{ t('site.common.done') }}</Button>
        </section>

        <section class="order-2 grid gap-3 rounded-xl bg-sidebar p-4 min-[1100px]:order-none" aria-labelledby="how-title">
          <h2 id="how-title" class="text-sm font-semibold tracking-tight">{{ t('site.ai.how.title') }}</h2>
          <ul class="m-0 grid list-none gap-3 p-0">
            <li v-for="item in how" :key="item.text" class="flex items-start gap-2.5 text-[13px] text-muted-foreground">
              <component :is="item.icon" class="mt-0.5 size-4 flex-none" aria-hidden="true" />
              <span>{{ item.text }}</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </StudioPage>
</template>
