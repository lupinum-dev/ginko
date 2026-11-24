<!-- A site that never had a release has no areas: its Content page would be empty. This says where the areas come from
     and gives the three steps with this site's own values, so a new site needs no docs page open next to it. Owners
     and admins only (the key lives on the Team page). The page drops it once the first release arrives. -->
<script setup lang="ts">
import { Button } from '@studio/components/ui/button'

const props = defineProps<{ slug: string }>()
const { t } = useI18n()
// The command names this Studio's own address: the CLI reads its discovery document (/.well-known/ginko-platform) and
// sends the release to the backend address it finds there, so a website needs only the address people know.
const studio = useRequestURL().origin
const config = computed(() => `site: '${props.slug}',`)
// `ginko connect` replaces step 1: the person confirms a code on /connect and the command stores the key.
const connect = `npx ginko connect ${studio}`
const release = computed(() => `GINKO_PLATFORM=${studio} GINKO_KEY=… GINKO_COMMIT=$(git rev-parse HEAD) npx ginko release`)
const CODE = 'm-0 select-all whitespace-pre-wrap rounded-md bg-muted px-3 py-2 font-mono text-[13px] [overflow-wrap:anywhere]'
</script>

<template>
  <section class="rounded-xl border bg-card" aria-labelledby="connect-title">
    <div class="grid gap-1 border-b px-4 py-3 sm:px-6">
      <h2 id="connect-title" class="text-[15px] font-semibold tracking-tight">{{ t('site.connect.title') }}</h2>
      <p class="max-w-[65ch] text-[13px] text-muted-foreground">{{ t('site.connect.lede') }}</p>
    </div>
    <ol class="m-0 grid list-none gap-5 px-4 py-4 sm:px-6 sm:py-5">
      <li class="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 gap-y-2">
        <span class="text-sm font-semibold text-muted-foreground tabular-nums" aria-hidden="true">1</span>
        <p class="max-w-[65ch] text-sm">{{ t('site.connect.key') }}</p>
        <Button as-child variant="outline" size="sm" class="col-start-2 justify-self-start"><NuxtLink :to="`/s/${slug}/team`">{{ t('site.connect.keyLink') }}</NuxtLink></Button>
        <p class="col-start-2 max-w-[65ch] text-sm text-muted-foreground">{{ t('site.connect.short') }}</p>
        <pre :class="[CODE, 'col-start-2']">{{ connect }}</pre>
      </li>
      <li class="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 gap-y-2">
        <span class="text-sm font-semibold text-muted-foreground tabular-nums" aria-hidden="true">2</span>
        <p class="max-w-[65ch] text-sm">{{ t('site.connect.id') }}</p>
        <pre :class="[CODE, 'col-start-2']">{{ config }}</pre>
      </li>
      <li class="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 gap-y-2">
        <span class="text-sm font-semibold text-muted-foreground tabular-nums" aria-hidden="true">3</span>
        <p class="max-w-[65ch] text-sm">{{ t('site.connect.release') }}</p>
        <pre :class="[CODE, 'col-start-2']">{{ release }}</pre>
      </li>
    </ol>
    <p class="border-t px-4 py-3 text-[13px] text-muted-foreground sm:px-6">{{ t('site.connect.after') }}</p>
  </section>
</template>
