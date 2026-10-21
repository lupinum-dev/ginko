<!-- The person's menu at the foot of the rail (and top right on phones): who is signed in, "Update website now"
     for owner and admin, My sites, Account settings, sign out on other devices, sign out. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { LayoutGridIcon, LogOutIcon, MonitorSmartphoneIcon, RefreshCwIcon, UserRoundCogIcon } from '@lucide/vue'
import { useSignOut } from '../composables/useSignOut'

const props = defineProps<{ manager: boolean, lastRefresh?: number | null, updating: boolean, side?: 'top' | 'right' | 'bottom' }>()
const emit = defineEmits<{ update: [] }>()
const { user } = useConvexAuth()
const { t, format } = useI18n()
// The avatar shows the person: the first letter of the name they gave themselves (Account settings), else of the email.
// Read in the browser only: a server read defers this menu in the server render, so the reka ids of the menus after
// it were handed out in another order than in the browser (a hydration mismatch on every site page).
const { data: settings } = useConvexQuery(api.account.settings, {}, { server: false })
const name = computed(() => settings.value?.name?.trim() || undefined)
const initial = computed(() => (name.value ?? user.value?.email ?? '?').charAt(0).toUpperCase())
const { busy, signOut, signOutOthers } = useSignOut()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
        type="button" :aria-label="t('nav.account')" :title="name ?? user?.email ?? undefined"
        class="grid size-9 place-items-center rounded-full border border-primary/25 bg-accent text-sm font-semibold text-accent-foreground outline-none hover:ring-2 hover:ring-primary/30 focus-visible:ring-3 focus-visible:ring-ring/80 pointer-coarse:size-11"
      >{{ initial }}</button>
    </DropdownMenuTrigger>
    <DropdownMenuContent :side="props.side ?? 'right'" align="end" class="w-64">
      <DropdownMenuLabel v-if="user?.email" class="grid gap-0.5 font-normal">
        <span v-if="name" class="truncate font-medium text-foreground">{{ name }}</span>
        <span class="truncate text-muted-foreground">{{ user.email }}</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator v-if="user?.email" />
      <template v-if="manager">
        <DropdownMenuItem class="min-h-10 gap-2" :disabled="updating" @select="emit('update')">
          <RefreshCwIcon aria-hidden="true" />{{ updating ? t('basics.update.running') : t('basics.update.menu') }}
        </DropdownMenuItem>
        <p v-if="lastRefresh" class="px-2 pb-1.5 text-xs text-muted-foreground">{{ t('basics.update.lastAt', { when: format.relative(lastRefresh) }) }}</p>
        <DropdownMenuSeparator />
      </template>
      <DropdownMenuItem as-child class="min-h-10 gap-2">
        <NuxtLink to="/?all"><LayoutGridIcon aria-hidden="true" />{{ t('nav.mySites') }}</NuxtLink>
      </DropdownMenuItem>
      <DropdownMenuItem as-child class="min-h-10 gap-2">
        <NuxtLink to="/account"><UserRoundCogIcon aria-hidden="true" />{{ t('nav.accountPage') }}</NuxtLink>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem class="min-h-10 gap-2" :disabled="busy" @select="signOutOthers">
        <MonitorSmartphoneIcon aria-hidden="true" />{{ t('nav.signOutOthers') }}
      </DropdownMenuItem>
      <DropdownMenuItem class="min-h-10 gap-2" :disabled="busy" @select="signOut">
        <LogOutIcon aria-hidden="true" />{{ t('nav.signOut') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
