<!-- "Delete site" on the team page (owners and admins): the person types the site's address, then the deletion
     starts and runs 7 days (SiteDeleting shows the countdown and the way back). -->
<script setup lang="ts">
import { api } from '#convex/api'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import { opErrorOf } from '../composables/useOps'

const props = defineProps<{ slug: string, name: string }>()
const { t } = useI18n()
const { mutate: start, pending } = useConvexMutation(api.sites.startDeletion)
const typed = ref('')
const problem = ref('')
const matches = computed(() => typed.value === props.slug)

async function submit() {
  if (!matches.value) return
  problem.value = ''
  try {
    await start({ site: props.slug, confirm: typed.value })
  } catch (e) {
    problem.value = opErrorOf(e).message
  }
}
</script>

<template>
  <!-- The danger zone: its own card at the end of the page, apart from the everyday sections. The button stays an
       outline until the address matches, so it reads as locked rather than faded. -->
  <section class="grid gap-4 rounded-xl border border-destructive/30 bg-card p-4 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] min-[900px]:gap-8 min-[900px]:p-5" aria-labelledby="delete-site-title">
    <div class="grid content-start gap-1">
      <h2 id="delete-site-title" class="text-[15px] font-semibold tracking-tight text-destructive">{{ t('site.delete.title') }}</h2>
      <p class="max-w-[65ch] text-[13px] text-muted-foreground">{{ t('site.delete.text', { site: name }) }}</p>
    </div>
    <form class="grid gap-3" @submit.prevent="submit">
      <div class="grid gap-1.5">
        <label for="delete-site-confirm" class="text-sm leading-snug font-medium"><I18nT k="site.delete.confirmLabel" :params="{ slug }"><template #slug="{ text }"><code class="rounded bg-muted px-1 py-0.5 font-mono text-[13px]">{{ text }}</code></template></I18nT></label>
        <Input id="delete-site-confirm" v-model="typed" class="font-mono" autocomplete="off" autocapitalize="off" spellcheck="false" />
      </div>
      <p v-if="problem" class="font-semibold text-destructive" role="alert">{{ problem }}</p>
      <Button type="submit" :variant="matches ? 'destructive' : 'outline'" :class="['justify-self-start', !matches && 'text-destructive']" :disabled="!matches || pending">{{ t('site.delete.button') }}</Button>
    </form>
  </section>
</template>
