<!-- New site: a platform admin creates the empty site that a website's first release fills (sites.create). Three
     values: the name, the website's address and the identifier. The identifier is the one that stays: it is `site` in
     the website's ginko.config.ts and the address of the site in the Studio. Name and address are replaced by the
     first release. Reached from "My sites"; anyone but an admin gets one sentence instead of the form. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { ArrowLeftIcon } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import { siteIdOf, SITE_ID } from '../utils/sites'

definePageMeta({ topBar: true })
const { t } = useI18n()
useHead(() => ({ title: `${t('sites.new.title')} · Ginko` }))

const { data: allowed } = await useConvexQuery(api.sites.mayCreate, {})
const { mutate: create, pending } = useConvexMutation(api.sites.create)

const name = ref('')
const url = ref('')
const id = ref('')
// The identifier follows the name until the person types one of their own.
const ownId = ref(false)
watch(name, (value) => { if (!ownId.value) id.value = siteIdOf(value) })

/** What is wrong with each value, shown once the person tried to send the form. */
const tried = ref(false)
const problems = computed(() => ({
  name: name.value.trim() ? '' : t('sites.new.nameMissing'),
  url: /^https?:\/\/\S+\.\S+/.test(url.value.trim()) ? '' : t('sites.new.urlInvalid'),
  id: SITE_ID.test(id.value) ? '' : t('sites.new.idInvalid'),
}))
const problem = ref('')

async function submit() {
  tried.value = true
  problem.value = ''
  const wrong = (['name', 'url', 'id'] as const).find((field) => problems.value[field])
  if (wrong) {
    document.getElementById(`site-${wrong}`)?.focus()
    return
  }
  try {
    const { slug } = await create({ slug: id.value, name: name.value.trim(), url: url.value.trim() })
    // A new site has no areas: its Content page says how the website sends them.
    await navigateTo(`/s/${slug}/all`)
  } catch (e) {
    const error = opErrorOf(e)
    problem.value = error.code === 'SLUG_TAKEN' ? t('sites.new.idTaken', { id: id.value }) : error.message
  }
}

/** One value: its name and hint on the left, the field on the right (stacked on phones), as on the account page. */
const ROW = 'grid gap-3 px-4 py-4 sm:px-6 sm:py-5 min-[720px]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] min-[720px]:items-start min-[720px]:gap-8'
const HINT = 'text-[13px] text-muted-foreground'
const WRONG = 'text-[13px] font-medium text-destructive'
</script>

<template>
  <main class="grid grid-cols-[minmax(0,1fr)] gap-6">
    <div class="grid gap-3">
      <NuxtLink to="/?all" class="inline-flex min-h-8 items-center gap-1.5 justify-self-start rounded-md text-sm font-medium text-muted-foreground hover:text-foreground pointer-coarse:min-h-11">
        <ArrowLeftIcon class="size-4" aria-hidden="true" />{{ t('nav.mySites') }}
      </NuxtLink>
      <div class="grid gap-1">
        <h1>{{ t('sites.new.title') }}</h1>
        <p class="max-w-[65ch] text-[15px] text-muted-foreground min-[900px]:text-sm">{{ t('sites.new.lede') }}</p>
      </div>
    </div>

    <p v-if="allowed === false" class="text-muted-foreground">{{ t('sites.new.adminsOnly') }}</p>
    <form v-else-if="allowed" class="grid gap-4" novalidate @submit.prevent="submit">
      <p v-if="problem" class="font-medium text-destructive" role="alert">{{ problem }}</p>
      <div class="divide-y rounded-xl border bg-card">
        <div :class="ROW">
          <div class="grid gap-1">
            <label for="site-name" class="text-sm font-semibold">{{ t('sites.new.name') }}</label>
            <p id="site-name-hint" :class="HINT">{{ t('sites.new.nameHint') }}</p>
          </div>
          <div class="grid gap-1.5">
            <Input id="site-name" v-model="name" maxlength="100" autocomplete="off" aria-describedby="site-name-hint site-name-problem" :aria-invalid="tried && !!problems.name" />
            <p v-if="tried && problems.name" id="site-name-problem" :class="WRONG">{{ problems.name }}</p>
          </div>
        </div>

        <div :class="ROW">
          <div class="grid gap-1">
            <label for="site-url" class="text-sm font-semibold">{{ t('sites.new.url') }}</label>
            <p id="site-url-hint" :class="HINT">{{ t('sites.new.urlHint') }}</p>
          </div>
          <div class="grid gap-1.5">
            <Input id="site-url" v-model="url" type="url" inputmode="url" placeholder="https://www.example.com" autocomplete="off" spellcheck="false" aria-describedby="site-url-hint site-url-problem" :aria-invalid="tried && !!problems.url" />
            <p v-if="tried && problems.url" id="site-url-problem" :class="WRONG">{{ problems.url }}</p>
          </div>
        </div>

        <div :class="ROW">
          <div class="grid gap-1">
            <label for="site-id" class="text-sm font-semibold">{{ t('sites.new.id') }}</label>
            <p id="site-id-hint" :class="HINT">{{ t('sites.new.idHint') }}</p>
          </div>
          <div class="grid gap-1.5">
            <Input id="site-id" v-model="id" class="font-mono" maxlength="41" autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="site-id-hint site-id-problem" :aria-invalid="tried && !!problems.id" @input="ownId = true" />
            <p v-if="tried && problems.id" id="site-id-problem" :class="WRONG">{{ problems.id }}</p>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <Button type="submit" :disabled="pending">{{ t('sites.new.submit') }}</Button>
        <NuxtLink to="/?all" class="text-sm font-medium text-muted-foreground hover:text-foreground">{{ t('site.common.cancel') }}</NuxtLink>
      </div>
    </form>
  </main>
</template>
