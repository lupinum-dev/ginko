<!-- Team (UI.md 7): members with their rights, open invitations, the invite form, and the site's publishing keys. Owners and admins only;
     the members query is skipped for everyone else, so the server never answers them. -->
<script setup lang="ts">
import type { Label } from '@lupinum/ginko'
import { grantGroups } from '@lupinum/ginko/internal'
import { CONTAINED_FIELD } from '@studio/components/fields/sizes'
import { api } from '#convex/api'
import { opErrorOf } from '../../../../composables/useOps'
import { shownLabel } from '../../../../utils/labels'
import { whoText } from '../../../../utils/who'
import { Button } from '@studio/components/ui/button'
import { Badge } from '@studio/components/ui/badge'
import { Input } from '@studio/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@studio/components/ui/toggle-group'

definePageMeta({ layout: 'site' })

const { t, format } = useI18n()
const s = await useSiteData()
useHead(() => ({ title: t('site.title.team', { site: s.site.value?.name ?? t('site.fallback.site') }) }))
const { show } = useToast()

const team = useConvexQuery(api.members.list, () => (s.isManager.value ? { site: s.slug.value } : 'skip'))
const members = computed(() => team.data.value?.members ?? [])
const invites = computed(() => team.data.value?.invites ?? [])
const keys = computed(() => team.data.value?.keys ?? [])

const removeMember = useConvexMutation(api.members.remove)
const saveRights = useConvexMutation(api.members.setGrants)
const revokeInvite = useConvexMutation(api.invites.revoke)
const createInvite = useConvexMutation(api.invites.create)
const revokePushKey = useConvexMutation(api.release.revokePushKey)

const roleLabel = (role: 'owner' | 'staff') => (role === 'owner' ? t('site.role.owner') : t('site.role.staff'))
const noEmail = computed(() => t('site.team.noEmail'))

/**
 * Staff rights as "Speisekarte: Preis ändern, Gericht hinzufügen", read as the invite mail and the invite page read
 * them (core `grantGroups`). Grants of removed bricks or tasks have no effect (SPEC 2.7), so they are not shown.
 */
function grantLines(grants: string[]): string[] {
  const shown = (label: Label) => shownLabel(label, s.main.value)
  return grantGroups({ bricks: s.schema.value?.bricks ?? {} }, grants).map((g) => `${shown(g.label)}: ${g.tasks.map(shown).join(', ')}`)
}

/** Member rows: one open editor, one open confirmation, and one error message at a time. */
const editing = ref<{ id: string; grants: string[] } | null>(null)
const confirming = ref<string | null>(null)
const rowError = ref<{ id: string; message: string } | null>(null)
const memberBusy = computed(() => saveRights.pending.value || removeMember.pending.value)

function startEdit(id: string, grants: string[]) {
  rowError.value = null
  confirming.value = null
  editing.value = { id, grants: [...grants] }
}

function startRemove(id: string) {
  rowError.value = null
  editing.value = null
  confirming.value = id
}

async function saveEditing() {
  const edit = editing.value
  if (!edit) return
  try {
    await saveRights.mutate({ site: s.slug.value, member: edit.id, grants: edit.grants })
    editing.value = null
  } catch (error) {
    rowError.value = { id: edit.id, message: opErrorOf(error).message }
  }
}

// The row with the focused button goes away on success: the focus moves to a stable place, and a message says what happened.
const membersTitle = ref<HTMLElement | null>(null)
const inviteButton = ref<{ $el: HTMLElement } | null>(null)

async function confirmRemove(id: string, email: string) {
  try {
    await removeMember.mutate({ site: s.slug.value, member: id })
    confirming.value = null
    show(t('site.team.memberRemoved', { email }))
    await nextTick()
    membersTitle.value?.focus()
  } catch (error) {
    rowError.value = { id, message: opErrorOf(error).message }
  }
}

/** Invitations: revoking shows the server's message at the list (an owner may not revoke an admin's owner invite). */
const inviteError = ref<string | null>(null)
async function revoke(id: string, email: string) {
  inviteError.value = null
  try {
    await revokeInvite.mutate({ site: s.slug.value, invite: id })
    show(t('site.team.inviteRevoked', { email }))
    await nextTick()
    // "Einladen", or the address field when the invite form is open in its place.
    if (inviting.value) document.getElementById('invite-email')?.focus()
    else inviteButton.value?.$el.focus()
  } catch (error) {
    inviteError.value = opErrorOf(error).message
  }
}

/** "valid until 15.10." in the site's time zone. */
const validUntil = (expiresAt: number) => t('site.team.validUntil', { date: format.date(new Date(expiresAt), { timeZone: s.schema.value?.timeZone ?? 'Europe/Vienna', day: 'numeric', month: 'numeric' }) })

// The invite form: all rights off by default (least privilege, UI.md 7).
const inviting = ref(false)
const form = reactive<{ email: string; role: 'owner' | 'staff'; grants: string[] }>({ email: '', role: 'staff', grants: [] })
const formError = ref<string | null>(null)

function openForm() {
  form.email = ''
  form.role = 'staff'
  form.grants = []
  formError.value = null
  inviting.value = true
}

async function sendInvite() {
  const email = form.email.trim()
  formError.value = null
  try {
    await createInvite.mutate({
      site: s.slug.value,
      email,
      role: form.role,
      grants: form.role === 'staff' ? form.grants : [],
    })
    show(t('site.team.inviteSent', { email }))
    inviting.value = false
  } catch (error) {
    formError.value = opErrorOf(error).message
  }
}

// Publishing keys belong to the site and outlive the person who made them (removing a member does not end them).
// The keys list asks once before revoking; in a member's remove confirmation one click revokes, as that panel already asks.
type Key = (typeof keys.value)[number]
const keysOf = (member: string) => keys.value.filter((k) => k.member === member)
/** A day, never a time: the server stamps "last used" at most once an hour. */
const day = (ms: number) => format.date(new Date(ms), { timeZone: s.schema.value?.timeZone ?? 'Europe/Vienna', day: 'numeric', month: 'short', year: 'numeric' })
const usedText = (k: Key) => (k.lastUsedAt ? t('site.keys.lastUsedAt', { when: day(k.lastUsedAt) }) : t('site.keys.neverUsed'))
const confirmingKey = ref<string | null>(null)
const keyError = ref<{ id: string; message: string } | null>(null)

function startRevoke(id: string) {
  keyError.value = null
  confirmingKey.value = id
}

async function revokeKey(key: Key) {
  keyError.value = null
  try {
    await revokePushKey.mutate({ site: s.slug.value, key: key.id })
    confirmingKey.value = null
    show(t('site.keys.revoked', { label: key.label }))
  } catch (error) {
    keyError.value = { id: key.id, message: opErrorOf(error).message }
  }
}

/** The last owner cannot be removed (the server refuses), so the button is not offered. */
const ownerCount = computed(() => (members.value ?? []).filter((m) => m.role === 'owner').length)
</script>

<template>
  <div class="w-full max-w-[760px] px-4 pt-4 min-[720px]:px-6 min-[720px]:pt-8">
    <h1 class="mb-5 text-xl font-semibold tracking-tight">{{ t('site.team.heading') }}</h1>
    <p v-if="s.schema.value && !s.isManager.value" class="py-6 text-muted-foreground">{{ t('site.team.ownersOnly') }}</p>

    <template v-else-if="s.schema.value && s.isManager.value">
      <section class="grid gap-3 pb-6" aria-labelledby="members-title">
        <h2 id="members-title" ref="membersTitle" tabindex="-1" class="text-base font-semibold tracking-tight outline-none">{{ t('site.team.members') }}</h2>
        <ul class="m-0 list-none overflow-hidden rounded-xl border p-0">
          <li v-for="m in members" :key="m.id" class="grid gap-2 border-b px-4 py-3 last:border-b-0">
            <div class="grid gap-x-4 gap-y-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <div class="grid min-w-0 gap-0.5">
                <p class="flex flex-wrap items-center gap-2 font-medium"><span class="[overflow-wrap:anywhere]">{{ m.email ?? noEmail }}</span><Badge as="span" variant="soft">{{ roleLabel(m.role) }}</Badge><Badge v-if="m.you" as="span" variant="outline">{{ t('site.team.you') }}</Badge></p>
                <ul v-if="m.role === 'staff'" class="m-0 grid list-none gap-0.5 p-0 text-[13px] text-muted-foreground">
                  <li v-for="line in grantLines(m.grants)" :key="line">{{ line }}</li>
                  <li v-if="!grantLines(m.grants).length">{{ t('site.team.noRights') }}</li>
                </ul>
              </div>
              <div v-if="editing?.id !== m.id && confirming !== m.id" class="flex flex-wrap items-center gap-2">
                <Button v-if="m.role === 'staff'" type="button" variant="secondary" size="sm" @click="startEdit(m.id, m.grants)">{{ t('site.team.changeRights') }}</Button>
                <!-- Not on the own row: removing yourself by mistake locks you out; another owner or the support can do it. -->
                <Button v-if="!m.you && (m.role !== 'owner' || ownerCount > 1)" type="button" variant="ghost" size="sm" class="text-destructive hover:text-destructive" @click="startRemove(m.id)">{{ t('site.common.remove') }}</Button>
              </div>
            </div>

            <template v-if="editing?.id === m.id">
              <GrantsChecklist v-model="editing.grants" :bricks="s.bricks.value" />
              <div class="flex flex-wrap gap-2">
                <Button type="button" size="sm" :disabled="memberBusy" @click="saveEditing">{{ t('site.common.save') }}</Button>
                <Button type="button" variant="ghost" size="sm" :disabled="memberBusy" @click="editing = null">{{ t('site.common.cancel') }}</Button>
              </div>
            </template>

            <div v-else-if="confirming === m.id" class="grid gap-2 rounded-md bg-warning/12 px-3 py-2.5">
              <p><I18nT k="site.team.losesAccess" :params="{ email: m.email ?? noEmail, site: s.site.value?.name ?? t('site.fallback.site') }"><template #email="{ text }"><strong>{{ text }}</strong></template></I18nT></p>
              <template v-if="keysOf(m.id).length">
                <p class="font-medium">{{ t('site.team.keysOfMember', { email: m.email ?? noEmail, count: keysOf(m.id).length }) }}</p>
                <ul class="m-0 grid list-none gap-2 p-0">
                  <li v-for="k in keysOf(m.id)" :key="k.id" class="grid gap-1">
                    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <div class="grid min-w-0 gap-0.5">
                        <p class="font-medium [overflow-wrap:anywhere]">{{ k.label }}</p>
                        <p class="text-[13px] text-muted-foreground">{{ t('site.keys.createdAt', { when: day(k.createdAt) }) }}{{ usedText(k) }}</p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" class="text-destructive hover:text-destructive" :disabled="revokePushKey.pending.value" @click="revokeKey(k)">{{ t('site.keys.revoke') }}</Button>
                    </div>
                    <p v-if="keyError?.id === k.id" class="font-semibold text-destructive" role="alert">{{ keyError.message }}</p>
                  </li>
                </ul>
                <p class="text-[13px] text-muted-foreground">{{ t('site.team.keysStay') }}</p>
              </template>
              <div class="flex flex-wrap gap-2">
                <Button type="button" variant="destructive" size="sm" :disabled="memberBusy" @click="confirmRemove(m.id, m.email ?? noEmail)">{{ t('site.common.remove') }}</Button>
                <Button type="button" variant="ghost" size="sm" :disabled="memberBusy" @click="confirming = null">{{ t('site.common.cancel') }}</Button>
              </div>
            </div>

            <p v-if="rowError?.id === m.id" class="font-semibold text-destructive" role="alert">{{ rowError.message }}</p>
          </li>
        </ul>
      </section>

      <section v-if="invites.length || inviteError" class="grid gap-3 pb-6" aria-labelledby="invites-title">
        <h2 id="invites-title" class="text-base font-semibold tracking-tight">{{ t('site.team.openInvites') }}</h2>
        <p v-if="inviteError" class="font-semibold text-destructive" role="alert">{{ inviteError }}</p>
        <ul class="m-0 list-none overflow-hidden rounded-xl border p-0">
          <li v-for="i in invites" :key="i.id" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3 last:border-b-0">
            <div class="grid min-w-0 gap-0.5">
              <p class="font-medium [overflow-wrap:anywhere]">{{ i.email }}</p>
              <p class="text-[13px] text-muted-foreground">{{ roleLabel(i.role) }}, {{ validUntil(i.expiresAt) }}</p>
            </div>
            <Button type="button" variant="secondary" size="sm" :disabled="revokeInvite.pending.value" @click="revoke(i.id, i.email)">{{ t('site.team.revokeInvite') }}</Button>
          </li>
        </ul>
      </section>

      <section class="grid gap-3">
        <Button v-if="!inviting" ref="inviteButton" type="button" class="justify-self-start" @click="openForm">{{ t('site.team.invite') }}</Button>
        <form v-else class="grid gap-4 rounded-xl border bg-card p-4" @submit.prevent="sendInvite">
          <div :class="CONTAINED_FIELD">
            <label for="invite-email" class="text-xs leading-snug font-medium text-muted-foreground">{{ t('site.form.email') }}</label>
            <Input id="invite-email" v-model="form.email" type="email" autocomplete="off" required :aria-invalid="!!formError" />
          </div>

          <div class="grid gap-2">
            <p id="invite-role-label" class="text-sm font-medium">{{ t('site.team.role') }}</p>
            <ToggleGroup type="single" variant="segmented" aria-labelledby="invite-role-label" :model-value="form.role" @update:model-value="(next) => next && (form.role = next as 'owner' | 'staff')">
              <ToggleGroupItem value="staff" class="px-3">{{ t('site.role.staff') }}</ToggleGroupItem>
              <ToggleGroupItem v-if="s.role.value === 'admin'" value="owner" class="px-3">{{ t('site.role.owner') }}</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div v-if="form.role === 'staff'" class="grid gap-2">
            <p class="text-sm font-medium">{{ t('site.team.rights') }}</p>
            <GrantsChecklist v-model="form.grants" :bricks="s.bricks.value" />
          </div>

          <p v-if="formError" class="font-semibold text-destructive" role="alert">{{ formError }}</p>
          <div class="flex flex-wrap gap-2">
            <Button type="submit" :disabled="createInvite.pending.value">{{ t('site.team.sendInvite') }}</Button>
            <Button type="button" variant="ghost" :disabled="createInvite.pending.value" @click="inviting = false">{{ t('site.common.cancel') }}</Button>
          </div>
        </form>
      </section>

      <section v-if="keys.length" class="grid gap-3 py-6" aria-labelledby="keys-title">
        <h2 id="keys-title" class="text-base font-semibold tracking-tight">{{ t('site.keys.heading') }}</h2>
        <p class="text-[13px] text-muted-foreground">{{ t('site.keys.lead') }}</p>
        <ul class="m-0 list-none overflow-hidden rounded-xl border p-0">
          <li v-for="k in keys" :key="k.id" class="grid gap-2 border-b px-4 py-3 last:border-b-0">
            <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div class="grid min-w-0 gap-0.5">
                <p class="font-medium [overflow-wrap:anywhere]">{{ k.label }}</p>
                <p class="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">{{ t('site.keys.createdBy', { when: day(k.createdAt), who: whoText(k.by, t) }) }}{{ usedText(k) }}</p>
              </div>
              <Button v-if="confirmingKey !== k.id" type="button" variant="ghost" size="sm" class="text-destructive hover:text-destructive" @click="startRevoke(k.id)">{{ t('site.keys.revoke') }}</Button>
            </div>
            <div v-if="confirmingKey === k.id" class="grid gap-2 rounded-md bg-warning/12 px-3 py-2.5">
              <p>{{ t('site.keys.revokeConfirm', { label: k.label }) }}</p>
              <div class="flex flex-wrap gap-2">
                <Button type="button" variant="destructive" size="sm" :disabled="revokePushKey.pending.value" @click="revokeKey(k)">{{ t('site.keys.revoke') }}</Button>
                <Button type="button" variant="ghost" size="sm" @click="confirmingKey = null">{{ t('site.common.cancel') }}</Button>
              </div>
            </div>
            <p v-if="keyError?.id === k.id" class="font-semibold text-destructive" role="alert">{{ keyError.message }}</p>
          </li>
        </ul>
      </section>

      <DeleteSite v-if="s.site.value" :slug="s.slug.value" :name="s.site.value.name" />
    </template>
  </div>
</template>
