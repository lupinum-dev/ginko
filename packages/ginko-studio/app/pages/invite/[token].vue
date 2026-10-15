<script setup lang="ts">
// SPEC 10, UI 6: accepting needs the signed-in user with the invited email.
import { api } from '#convex/api'
import { Button } from '@studio/components/ui/button'

const { t } = useI18n()
useHead(() => ({ title: `${t('invite.titleShort')} · Ginko` }))

const route = useRoute()
const token = String(route.params.token)
const { mutate: accept, pending } = useConvexMutation(api.invites.accept)
const { data: offer, pending: loading } = useConvexQuery(api.invites.peek, { token })
const error = ref('')

async function run() {
  error.value = ''
  try {
    const result = await accept({ token })
    await navigateTo(`/s/${result.site}`, { replace: true })
  } catch (e) {
    const failure = opErrorOf(e)
    error.value = failure.code === 'NOT_FOUND'
      ? t('invite.expired')
      : failure.code === 'FORBIDDEN'
        ? t('invite.otherEmail')
        : failure.message
  }
}
</script>

<template>
  <main class="mx-auto grid w-full max-w-sm gap-4 rounded-2xl border bg-card p-6 sm:p-8">
    <h1 class="text-xl font-semibold tracking-tight">{{ t('invite.title') }}</h1>
    <template v-if="offer">
      <p class="text-muted-foreground"><I18nT k="invite.lead" :params="{ site: offer.site, role: t(offer.role === 'owner' ? 'invite.role.owner' : 'invite.role.staff') }"><template #site="{ text }"><strong class="font-medium text-foreground">{{ text }}</strong></template></I18nT></p>
      <p v-if="!offer.forYou" class="text-destructive" role="alert">{{ t('invite.otherEmail') }}</p>
      <p v-if="error" class="text-destructive" role="alert">{{ error }}</p>
      <Button v-if="offer.forYou" class="h-10 w-full" type="button" :disabled="pending" @click="run">{{ pending ? t('invite.accepting') : t('invite.title') }}</Button>
    </template>
    <p v-else-if="!loading" class="text-destructive" role="alert">{{ t('invite.expired') }}</p>
    <SignOut />
  </main>
</template>
