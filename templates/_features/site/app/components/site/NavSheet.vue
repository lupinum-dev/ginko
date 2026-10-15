<script setup lang="ts">
import { ArrowRight, Menu } from '@lucide/vue'

// The navigation on phones: a sheet from the inline start (the right in right-to-left languages). reka-ui keeps the
// focus inside while open and returns it to the button on close. After a navigation the sheet closes and the focus
// moves to the new page's content instead, so keyboard and screen reader users start there, not in the header.
// The language switch sits at the top, with full names, since the header has no room for it on phones. The footer
// links (`more`: team, reports) follow the menu as a second, quieter list, so they are one tap away on a phone too.
// `until`: the header shows its own links from this breakpoint up, so the menu button hides there.
type Link = { key: string, label: string, to: string }
withDefaults(defineProps<{ links: Link[], more?: Link[], until?: 'md' | 'lg' }>(), { more: () => [], until: 'md' })
const { t } = useI18n('site')
const open = ref(false)
const route = useRoute()
let navigated = false
watch(() => route.fullPath, () => {
  navigated = open.value
  open.value = false
})
function returnFocus(event: Event) {
  if (!navigated) return
  navigated = false
  event.preventDefault()
  document.getElementById('main')?.focus({ preventScroll: true })
}
</script>

<template>
  <Sheet v-model:open="open">
    <SheetTrigger as-child>
      <Button variant="ghost" size="icon" class="print:hidden" :class="until === 'lg' ? 'lg:hidden' : 'md:hidden'">
        <Menu aria-hidden="true" />
        <span class="sr-only">{{ t('nav.open') }}</span>
      </Button>
    </SheetTrigger>
    <SheetContent side="start" :close-label="t('close')" :aria-describedby="undefined" class="px-6 pt-5 pb-8" @close-auto-focus="returnFocus">
      <SheetTitle class="flex h-11 items-center text-small text-muted-foreground">{{ t('nav.title') }}</SheetTitle>
      <SiteLanguageSwitch names class="mb-4 text-small" />
      <nav v-if="links.length" :aria-label="t('nav.label')">
        <ul class="flex flex-col border-t">
          <li v-for="link in links" :key="link.key" class="border-b">
            <SiteNavLink :to="link.to" class="flex min-h-14 items-center justify-between gap-4 py-3 text-h3 font-medium underline-offset-4 aria-[current=page]:underline">
              {{ link.label }}
              <ArrowRight class="size-5 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden="true" />
            </SiteNavLink>
          </li>
        </ul>
      </nav>
      <ul v-if="more.length" class="mt-4 flex flex-col">
        <li v-for="link in more" :key="link.key">
          <SiteNavLink :to="link.to" class="flex min-h-11 items-center text-small text-muted-foreground underline-offset-4 hover:text-foreground hover:underline aria-[current=page]:text-foreground aria-[current=page]:underline">
            {{ link.label }}
          </SiteNavLink>
        </li>
      </ul>
    </SheetContent>
  </Sheet>
</template>
