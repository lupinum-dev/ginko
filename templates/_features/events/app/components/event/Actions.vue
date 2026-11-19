<script setup lang="ts">
import { Mail, Phone } from '@lucide/vue'
import type { EventFacts } from '~/composables/useEvents'

/** How to take part in one event: "fully booked" or "booking has closed", else the booking link until `bookingUntil`,
 *  else phone and email of the business (content/site.md). The event page shows it in its header, or after a
 *  template's own `event/Header.vue`. */
const props = defineProps<{ event: { data: Pick<EventFacts, 'booking' | 'bookingUntil' | 'soldOut'> } }>()
const site = useGinko('site')
const { t } = useI18n('events')
const { ltr } = useEventText()
const contact = computed(() => site.value.data)
const bookingOf = useEventBooking()
const closedOf = useBookingClosed()
const booking = computed(() => bookingOf(props.event.data))
const closed = computed(() => closedOf(props.event.data))
</script>

<template>
  <p v-if="event.data.soldOut" class="text-lead font-semibold">{{ t('soldOut') }}</p>
  <p v-else-if="closed" class="text-lead font-semibold">{{ t('bookingClosed') }}</p>
  <div v-else-if="booking" class="flex flex-wrap gap-3">
    <Button as-child size="lg" class="max-sm:w-full">
      <a :href="booking" rel="noopener">{{ t('book') }}</a>
    </Button>
  </div>
  <div v-else-if="contact.phone || contact.email" class="flex flex-col gap-3">
    <p class="text-muted-foreground">{{ t('reserve') }}</p>
    <div class="flex flex-wrap gap-3">
      <Button v-if="contact.phone" as-child size="lg" class="max-sm:w-full">
        <a :href="telHref(contact.phone)"><Phone aria-hidden="true" />{{ t('call', { phone: ltr(contact.phone) }) }}</a>
      </Button>
      <Button v-if="contact.email" as-child size="lg" :variant="contact.phone ? 'outline' : 'default'" class="max-sm:w-full">
        <a :href="`mailto:${contact.email}`"><Mail aria-hidden="true" />{{ t('email') }}</a>
      </Button>
    </div>
  </div>
</template>
