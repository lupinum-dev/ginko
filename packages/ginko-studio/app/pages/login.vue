<script setup lang="ts">
import { CONTAINED_FIELD } from '@studio/components/fields/sizes'
// SPEC 10, UI 6: email, then a 6-digit code. The answer to "send code" is the same for every
// address, so the page never tells whether someone has an account.
import { api } from '#convex/api'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'

definePageMeta({ convexAuth: 'guest' })
const { t } = useI18n()
useHead(() => ({ title: `${t('login.title')} · Ginko` }))

const { client } = useConvexAuth()
// SPEC 10: hosted without a mail provider there is no sign-in, and the page says so.
const { data: available } = await useConvexQuery(api.mail.signInAvailable, {}, { auth: 'none' })
const returnTo = useConvexAuthReturnTo()

// The invite page hands over the invited address, so a typo cannot end in a code that never comes (UI.md 6).
const email = ref(useState<string>('ginko:loginEmail', () => '').value)
const code = ref('')
const step = ref<'email' | 'code'>('email')
const busy = ref(false)
const error = ref('')
const codeInput = ref<{ $el: HTMLElement } | null>(null)
// Before hydration a tap would submit the form natively and put the email into the URL.
const hydrated = ref(false)
onMounted(() => { hydrated.value = true })

const cleanEmail = computed(() => email.value.trim().toLowerCase())

async function sendCode() {
  error.value = ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail.value)) {
    error.value = t('login.invalidEmail')
    return
  }
  busy.value = true
  try {
    const result = await client.emailOtp.sendVerificationOtp({ email: cleanEmail.value, type: 'sign-in' })
    if (result.error) {
      error.value = t('login.sendFailed')
      return
    }
    step.value = 'code'
    await nextTick()
    codeInput.value?.$el.focus()
  } finally {
    busy.value = false
  }
}

async function signIn() {
  error.value = ''
  const otp = code.value.replace(/\D/g, '')
  if (otp.length !== 6) {
    error.value = t('login.sixDigits')
    return
  }
  busy.value = true
  try {
    const result = await client.signIn.emailOtp({ email: cleanEmail.value, otp })
    if (result.error) {
      // Better Auth: 429 = too many requests in a minute; TOO_MANY_ATTEMPTS = this code is used up (3 wrong tries).
      const { status, code } = result.error as { status?: number; code?: string }
      error.value = status === 429 ? t('login.tooMany')
        : code === 'TOO_MANY_ATTEMPTS' ? t('login.tooManyWrong')
        : t('login.wrongCode')
      return
    }
    await navigateTo(returnTo.value ?? '/')
  } finally {
    busy.value = false
  }
}

function otherEmail() {
  step.value = 'email'
  code.value = ''
  error.value = ''
}
</script>

<template>
  <main class="mx-auto w-full max-w-sm rounded-2xl border bg-card p-6 sm:p-8">
    <h1 class="mb-5 text-xl font-semibold tracking-tight">{{ t('login.title') }}</h1>
    <p v-if="available === false" class="text-muted-foreground">{{ t('login.unavailable') }}</p>
    <form v-else-if="step === 'email'" class="grid gap-2.5" novalidate @submit.prevent="sendCode">
      <div :class="CONTAINED_FIELD">
        <label for="email" class="text-xs leading-snug font-medium text-muted-foreground">{{ t('login.email') }}</label>
        <Input id="email" v-model="email" type="email" autocomplete="email" inputmode="email" required :aria-invalid="!!error" :aria-describedby="error ? 'login-error' : undefined" />
      </div>
      <p v-if="error" id="login-error" class="text-sm text-destructive" role="alert">{{ error }}</p>
      <Button class="mt-2 h-10 w-full" type="submit" :disabled="busy || !hydrated">{{ busy ? t('login.sending') : t('login.sendCode') }}</Button>
    </form>
    <form v-else class="grid gap-2.5" novalidate @submit.prevent="signIn">
      <p class="mb-2 text-muted-foreground"><I18nT k="login.sent" :params="{ email: cleanEmail }"><template #email="{ text }"><strong class="font-medium text-foreground">{{ text }}</strong></template></I18nT></p>
      <label for="code" class="text-sm font-medium">{{ t('login.code') }}</label>
      <Input id="code" ref="codeInput" v-model="code" class="h-12 text-center text-2xl tracking-[0.3em] md:text-2xl" inputmode="numeric" autocomplete="one-time-code" maxlength="7" :aria-invalid="!!error" :aria-describedby="error ? 'login-error' : undefined" />
      <p v-if="error" id="login-error" class="text-sm text-destructive" role="alert">{{ error }}</p>
      <Button class="mt-2 h-10 w-full" type="submit" :disabled="busy">{{ busy ? t('login.submitting') : t('login.submit') }}</Button>
      <div class="mt-1 flex flex-wrap justify-center gap-1">
        <Button variant="ghost" size="sm" type="button" :disabled="busy" @click="sendCode">{{ t('login.newCode') }}</Button>
        <Button variant="ghost" size="sm" type="button" @click="otherEmail">{{ t('login.otherEmail') }}</Button>
      </div>
    </form>
  </main>
</template>
