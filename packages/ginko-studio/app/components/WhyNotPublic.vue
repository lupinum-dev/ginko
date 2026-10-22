<!-- "Why not on the website?" (UI.md 10.6): every reason from entries.whyNotPublic in one sentence in the reader's
     language (textOf), each with the button for its fix where the Studio has one. Mount it when the popover opens. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { useConvexQuery, useI18n } from '#imports'
import { computed } from 'vue'
import { Button } from '@studio/components/ui/button'
import { useTextOf } from '../composables/useTextOf'

const props = defineProps<{ site: string; entry: string; locale: string; timeZone: string; main: string }>()
/** `publish`: the entry's publish form; `restore`: bring a removed entry back; `translate`: switch the form to that language. */
const emit = defineEmits<{ publish: []; restore: []; translate: [locale: string] }>()
const { t } = useI18n()
const textOf = useTextOf(() => ({ timeZone: props.timeZone, main: props.main }))

const { data, error } = useConvexQuery(api.entries.whyNotPublic, () => ({ site: props.site, entry: props.entry, locale: props.locale }))
const lines = computed(() => (data.value?.reasons ?? []).map((reason) => ({
  code: reason.code,
  action: reason.action,
  text: textOf(reason.msg, reason.sentence),
})))
</script>

<template>
  <div class="grid gap-3 text-sm">
    <p v-if="error" class="text-destructive" role="alert">{{ t('problem.generic') }}</p>
    <p v-else-if="!data" class="text-muted-foreground">{{ t('basics.why.loading') }}</p>
    <p v-else-if="!lines.length">{{ t('basics.why.none') }}</p>
    <ul v-else class="m-0 grid list-none gap-3 p-0">
      <li v-for="line in lines" :key="line.code" class="grid justify-items-start gap-1.5">
        <p>{{ line.text }}</p>
        <Button v-if="line.action === 'publish'" type="button" size="sm" @click="emit('publish')">{{ t('basics.why.publish') }}</Button>
        <Button v-else-if="line.action === 'restore'" type="button" size="sm" @click="emit('restore')">{{ t('basics.why.restore') }}</Button>
        <Button v-else-if="line.action === 'translate'" type="button" size="sm" variant="outline" @click="emit('translate', props.locale)">{{ t('basics.why.translate') }}</Button>
      </li>
    </ul>
  </div>
</template>
