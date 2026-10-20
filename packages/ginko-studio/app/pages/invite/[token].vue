<script setup lang="ts">
// SPEC 10, UI 6: the page an invite mail links to. Public, because the invitee is usually not signed in yet: it says
// who invites to which website with which rights, and how signing in works. Accepting needs the signed-in user with the
// invited email.
import { api } from '#convex/api'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'

definePageMeta({ convexAuth: false })
const { t, locale } = useI18n()
useHead(() => ({ title: `${t('invite.titleShort')} · Ginko` }))

const route = useRoute()
const token = String(route.params.token)
const { status } = useConvexAuth()
const { mutate: accept, pending } = useConvexMutation(api.invites.accept)
const { data: offer, pending: loading } = await useConvexQuery(api.invites.peek, () => ({ token, language: locale.value }), { auth: 'optional' })
// The server names the invited address (`offer.email`) only to a caller it sees signed out, so its answer decides which
// step shows: sign in, or accept. Also when this browser still holds a session the server has ended.
const error = ref('')

// Signed in and invited: the page asks once for the name the team will see (optional; "Meine Seiten" changes it later).
const { data: settings } = useConvexQuery(api.account.settings, () => (offer.value?.forYou ? {} : 'skip'))
const { mutate: setName } = useConvexMutation(api.account.setName)
const askName = computed(() => !!settings.value && !settings.value.name)
const name = ref('')

async function run() {
  error.value = ''
  try {
    const result = await accept({ token })
    // The name is optional: when it cannot be saved, the invite still counts, and "Meine Seiten" sets it later.
    if (askName.value && name.value.trim()) {
      try {
        await setName({ name: name.value })
      } catch (e) {
        useToast().show(opErrorOf(e).message, { tone: 'err' })
      }
    }
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

/** The sign-in page starts with the invited address (in memory, never in the URL), then comes back here. */
async function signIn() {
  if (offer.value?.email) useState<string>('ginko:loginEmail').value = offer.value.email
  await navigateTo(`/login?redirect=${encodeURIComponent(route.fullPath)}`)
}
</script>

<template>
  <main class="grid w-full gap-4 rounded-2xl border bg-card p-6 sm:p-8">
    <template v-if="offer">
      <h1 class="text-xl font-semibold tracking-tight">{{ t('invite.heading', { site: offer.site }) }}</h1>
      <p class="text-muted-foreground"><I18nT k="invite.lead" :params="{ site: offer.site, role: t(offer.role === 'owner' ? 'invite.role.owner' : 'invite.role.staff') }"><template #site="{ text }"><strong class="font-medium text-foreground">{{ text }}</strong></template></I18nT></p>
      <p v-if="offer.role === 'owner'">{{ t('invite.rightsOwner') }}</p>
      <div v-else-if="offer.rights.length" class="grid gap-1">
        <p>{{ t('invite.rightsStaff') }}</p>
        <ul class="m-0 grid list-disc gap-0.5 pl-5 text-muted-foreground">
          <li v-for="line in offer.rights" :key="line">{{ line }}</li>
        </ul>
      </div>
      <p v-else>{{ t('invite.rightsNone') }}</p>
      <template v-if="offer.email">
        <p class="text-muted-foreground"><I18nT k="invite.signInHint" :params="{ email: offer.email }"><template #email="{ text }"><strong class="font-medium text-foreground [overflow-wrap:anywhere]">{{ text }}</strong></template></I18nT></p>
        <Button class="h-10 w-full" type="button" @click="signIn">{{ t('nav.signIn') }}</Button>
      </template>
      <template v-else>
        <p v-if="!offer.forYou" class="text-destructive" role="alert">{{ t('invite.otherEmail') }}</p>
        <div v-if="offer.forYou && askName" class="grid gap-1.5">
          <label for="invite-name" class="font-medium">{{ t('sites.name') }}</label>
          <Input id="invite-name" v-model="name" maxlength="60" autocomplete="name" aria-describedby="invite-name-hint" />
          <p id="invite-name-hint" class="text-[13px] text-muted-foreground">{{ t('invite.nameHint') }}</p>
        </div>
        <p v-if="error" class="text-destructive" role="alert">{{ error }}</p>
        <Button v-if="offer.forYou" class="h-10 w-full" type="button" :disabled="pending" @click="run">{{ pending ? t('invite.accepting') : t('invite.title') }}</Button>
      </template>
    </template>
    <template v-else-if="!loading">
      <h1 class="text-xl font-semibold tracking-tight">{{ t('invite.title') }}</h1>
      <p class="text-destructive" role="alert">{{ t('invite.expired') }}</p>
    </template>
    <SignOut v-if="offer ? !offer.email : status === 'authenticated'" />
  </main>
</template>
