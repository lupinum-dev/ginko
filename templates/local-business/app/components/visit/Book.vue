<script setup lang="ts">
import { ExternalLink, Mail, Phone } from '@lucide/vue'

/**
 * How to book, the same on the home page, the contact page and every treatment page, always in this order: call (the
 * number on the button, the phone hours right under it), email, and "Book online" when content/visit.md names a booking
 * page. Each shows only when it exists; the first one is the main action. `subject`: the email's subject (a treatment
 * page); `email`, `phone`: a person's own, else the practice's from content/site.md.
 */
const props = defineProps<{ subject?: string, email?: string, phone?: string }>()
const { contact, visit, booking } = useVisit()
const { t } = useI18n()
const langOf = useGinkoLang()

const phone = computed(() => props.phone || contact.value.phone)
const email = computed(() => props.email || contact.value.email)
const actions = computed(() => {
  const call = phone.value ? { key: 'call', href: telHref(phone.value), label: t('visit.call', { phone: phone.value }), icon: Phone } : undefined
  const mail = email.value
    ? { key: 'email', href: `mailto:${email.value}${props.subject ? `?subject=${encodeURIComponent(props.subject)}` : ''}`, label: t('visit.email'), icon: Mail }
    : undefined
  const online = booking.value ? { key: 'booking', href: booking.value, label: t('visit.bookOnline'), icon: ExternalLink } : undefined
  return [call, mail, online].filter((action) => action !== undefined)
})
// "Mon–Fri 08:00–12:00, Mon–Thu also 14:00–17:00": each part stays on one line, so a day range never breaks at its dash.
const phoneHours = computed(() => visit.value.data.phoneHours?.split(/,\s*/).filter(Boolean) ?? [])
</script>

<template>
  <div v-if="actions.length" class="flex flex-wrap gap-3">
    <template v-for="(action, i) in actions" :key="action.key">
      <Button as-child size="lg" :variant="i === 0 ? 'default' : 'outline'" class="max-sm:w-full">
        <a :href="action.href" :rel="action.key === 'booking' ? 'noopener' : undefined">
          <component :is="action.icon" aria-hidden="true" />{{ action.label }}
        </a>
      </Button>
      <!-- Under the call button on phones; under the row of buttons from sm. -->
      <p v-if="action.key === 'call' && phoneHours.length" class="basis-full text-small tabular-nums sm:order-last">
        {{ t('visit.phoneHours') }}
        <span :lang="langOf(visit, 'phoneHours')">
          <template v-for="(part, j) in phoneHours" :key="part"><span class="whitespace-nowrap">{{ part }}</span>{{ j < phoneHours.length - 1 ? ', ' : '' }}</template>
        </span>
      </p>
    </template>
  </div>
</template>
