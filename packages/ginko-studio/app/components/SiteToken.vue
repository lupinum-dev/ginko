<!-- "Website-Token" on the team page (owners and admins): the secret the website sets as NUXT_GINKO_REVALIDATE_TOKEN.
     Made here and shown once, like a publishing key; a new one replaces the old one at once, so replacing asks first. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { KeyRoundIcon } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'
import { opErrorOf } from '../composables/useOps'

const props = defineProps<{ slug: string; hasToken: boolean }>()
const { t } = useI18n()
const { show } = useToast()
const create = useConvexMutation(api.sites.createSiteToken)

const ENV_NAME = 'NUXT_GINKO_REVALIDATE_TOKEN'
const confirming = ref(false)
const fresh = ref<string | null>(null)
const error = ref<string | null>(null)
// The new token's panel replaces the button that made it: the focus follows to what comes next.
const copyButton = ref<{ $el: HTMLElement } | null>(null)
const createButton = ref<{ $el: HTMLElement } | null>(null)

async function make() {
  error.value = null
  try {
    fresh.value = (await create.mutate({ site: props.slug })).token
    confirming.value = false
    await nextTick()
    copyButton.value?.$el.focus()
  } catch (err) {
    error.value = opErrorOf(err).message
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(fresh.value ?? '')
    show(t('site.siteToken.copied'))
  } catch {
    show(t('site.ai.copyFailed'))
  }
}

async function close() {
  fresh.value = null
  await nextTick()
  createButton.value?.$el.focus()
}
</script>

<template>
  <section class="grid gap-3 rounded-xl border bg-card px-4 py-3 pb-4" aria-labelledby="site-token-title">
    <div class="grid gap-1">
      <h2 id="site-token-title" class="text-[15px] font-semibold tracking-tight">{{ t('site.siteToken.heading') }}</h2>
      <p class="text-[13px] text-muted-foreground">{{ t('site.siteToken.lead', { name: ENV_NAME }) }}</p>
    </div>

    <!-- The new token, once: leaving the page or "Fertig" loses it. -->
    <div v-if="fresh" class="grid gap-3 rounded-lg border border-primary/40 bg-accent/40 p-3">
      <p class="text-[13px] font-medium">{{ t('site.siteToken.once', { name: ENV_NAME }) }}</p>
      <pre class="m-0 select-all whitespace-pre-wrap rounded-md bg-background px-3 py-2 font-mono text-[13px] [overflow-wrap:anywhere]">{{ fresh }}</pre>
      <div class="flex flex-wrap gap-2">
        <Button ref="copyButton" type="button" size="sm" @click="copy">{{ t('site.siteToken.copy') }}</Button>
        <Button type="button" variant="outline" size="sm" @click="close">{{ t('site.common.done') }}</Button>
      </div>
    </div>

    <template v-else>
      <p class="flex items-center gap-2 text-[13px]">
        <KeyRoundIcon class="size-4 flex-none text-muted-foreground" aria-hidden="true" />
        {{ hasToken ? t('site.siteToken.set') : t('site.siteToken.notSet') }}
      </p>
      <div v-if="confirming" class="grid gap-2 rounded-lg bg-warning/12 px-3 py-2.5">
        <p class="text-sm">{{ t('site.siteToken.replaceConfirm', { name: ENV_NAME }) }}</p>
        <div class="flex flex-wrap gap-2">
          <Button type="button" variant="destructive" size="sm" :disabled="create.pending.value" @click="make">{{ t('site.siteToken.replace') }}</Button>
          <Button type="button" variant="ghost" size="sm" @click="confirming = false">{{ t('site.common.cancel') }}</Button>
        </div>
      </div>
      <div v-else>
        <Button ref="createButton" type="button" variant="outline" size="sm" :disabled="create.pending.value" @click="hasToken ? (confirming = true) : make()">
          {{ hasToken ? t('site.siteToken.replace') : t('site.siteToken.create') }}
        </Button>
      </div>
    </template>
    <p v-if="error" class="font-semibold text-destructive" role="alert">{{ error }}</p>
  </section>
</template>
