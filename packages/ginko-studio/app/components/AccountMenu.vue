<!-- The person's menu at the foot of the rail (and top right on phones): who is signed in, "Update website now"
     for owner and admin, My sites, sign out on other devices, sign out. -->
<script setup lang="ts">
import { LayoutGridIcon, LogOutIcon, MonitorSmartphoneIcon, RefreshCwIcon } from '@lucide/vue'
import { useSignOut } from '../composables/useSignOut'

const props = defineProps<{ manager: boolean, lastRefresh?: number | null, updating: boolean, side?: 'top' | 'right' | 'bottom' }>()
const emit = defineEmits<{ update: [] }>()
const { user } = useConvexAuth()
const { t, format } = useI18n()
const initial = computed(() => (user.value?.email ?? '?').charAt(0).toUpperCase())
const { busy, signOut, signOutOthers } = useSignOut()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
        type="button" :aria-label="t('nav.account')"
        class="grid size-10 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground outline-none hover:ring-2 hover:ring-border focus-visible:ring-3 focus-visible:ring-ring/80 pointer-coarse:size-11"
      >{{ initial }}</button>
    </DropdownMenuTrigger>
    <DropdownMenuContent :side="props.side ?? 'right'" align="end" class="w-64">
      <DropdownMenuLabel v-if="user?.email" class="truncate font-normal text-muted-foreground">{{ user.email }}</DropdownMenuLabel>
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
      <DropdownMenuItem class="min-h-10 gap-2" :disabled="busy" @select="signOutOthers">
        <MonitorSmartphoneIcon aria-hidden="true" />{{ t('nav.signOutOthers') }}
      </DropdownMenuItem>
      <DropdownMenuItem class="min-h-10 gap-2" :disabled="busy" @select="signOut">
        <LogOutIcon aria-hidden="true" />{{ t('nav.signOut') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
