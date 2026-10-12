<!-- Team (UI.md 7): members with their rights, open invitations, and the invite form. Owners and admins only;
     the members query is skipped for everyone else, so the server never answers them. -->
<script setup lang="ts">
import { CONTAINED_FIELD } from '@studio/components/fields/sizes'
import { api } from '#convex/api'
import { opErrorOf } from '../../../../composables/useOps'
import { shownLabel } from '../../../../utils/labels'
import { Button } from '@studio/components/ui/button'
import { Badge } from '@studio/components/ui/badge'
import { Input } from '@studio/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@studio/components/ui/toggle-group'

definePageMeta({ layout: 'site', convexAuth: true })

const { t, format } = useI18n()
const s = await useSiteData()
useHead(() => ({ title: t('site.title.team', { site: s.site.value?.name ?? t('site.fallback.site') }) }))
const { show } = useToast()

const team = useConvexQuery(api.members.list, () => (s.isManager.value ? { site: s.slug.value } : 'skip'))
const members = computed(() => team.data.value?.members ?? [])
const invites = computed(() => team.data.value?.invites ?? [])

const removeMember = useConvexMutation(api.members.remove)
const saveRights = useConvexMutation(api.members.setGrants)
const revokeInvite = useConvexMutation(api.invites.revoke)
const createInvite = useConvexMutation(api.invites.create)

const roleLabel = (role: 'owner' | 'staff') => (role === 'owner' ? t('site.role.owner') : t('site.role.staff'))
const noEmail = computed(() => t('site.team.noEmail'))

/** Staff rights as "Speisekarte: Preis ändern, Gericht hinzufügen". Grants of removed bricks or tasks have no effect (SPEC 2.7), so they are not shown. */
function grantLines(grants: string[]): string[] {
  const lines = new Map<string, string[]>()
  for (const grant of grants) {
    const dot = grant.indexOf('.')
    const found = s.bricks.value.find(([key]) => key === grant.slice(0, dot))
    const task = found?.[1].tasks?.find((t) => t.id === grant.slice(dot + 1))
    if (!found || !task) continue
    const label = shownLabel(found[1].label, s.main.value)
    lines.set(label, [...(lines.get(label) ?? []), shownLabel(task.label, s.main.value)])
  }
  return [...lines].map(([label, tasks]) => `${label}: ${tasks.join(', ')}`)
}

/** Member rows: one open editor, one open confirmation, and one error message at a time. */
const editing = ref<{ id: string; grants: string[] } | null>(null)
const confirming = ref<string | null>(null)
const rowError = ref<{ id: string; message: string } | null>(null)
const memberBusy = ref(false)

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
  memberBusy.value = true
  try {
    await saveRights.mutate({ site: s.slug.value, member: edit.id, grants: edit.grants })
    editing.value = null
  } catch (error) {
    rowError.value = { id: edit.id, message: opErrorOf(error).message }
  } finally {
    memberBusy.value = false
  }
}

async function confirmRemove(id: string) {
  memberBusy.value = true
  try {
    await removeMember.mutate({ site: s.slug.value, member: id })
    confirming.value = null
  } catch (error) {
    rowError.value = { id, message: opErrorOf(error).message }
  } finally {
    memberBusy.value = false
  }
}

/** Invitations: revoking shows the server's message at the list (an owner may not revoke an admin's owner invite). */
const inviteError = ref<string | null>(null)
async function revoke(id: string) {
  inviteError.value = null
  try {
    await revokeInvite.mutate({ site: s.slug.value, invite: id })
  } catch (error) {
    inviteError.value = opErrorOf(error).message
  }
}

/** "valid until 15.10." in the site's timezone. */
const validUntil = (expiresAt: number) => t('site.team.validUntil', { date: format.date(new Date(expiresAt), { timeZone: s.schema.value?.timezone ?? 'Europe/Vienna', day: 'numeric', month: 'numeric' }) })

// The invite form: all rights off by default (least privilege, UI.md 7).
const inviting = ref(false)
const form = reactive<{ email: string; role: 'owner' | 'staff'; grants: string[] }>({ email: '', role: 'staff', grants: [] })
const formError = ref<string | null>(null)
const sending = ref(false)

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
  sending.value = true
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
  } finally {
    sending.value = false
  }
}

/** The last owner cannot be removed (the server refuses), so the button is not offered. */
const ownerCount = computed(() => (members.value ?? []).filter((m) => m.role === 'owner').length)
</script>

<template>
  <main class="w-full max-w-[760px] px-4 pt-4 pb-30 min-[720px]:px-6 min-[720px]:pt-8">
    <h1 class="mb-5 text-xl font-semibold tracking-tight">{{ t('site.team.heading') }}</h1>
    <p v-if="s.schema.value && !s.isManager.value" class="py-6 text-muted-foreground">{{ t('site.team.ownersOnly') }}</p>

    <template v-else-if="s.schema.value && s.isManager.value">
      <section class="grid gap-3 pb-6" aria-labelledby="members-title">
        <h2 id="members-title" class="text-base font-semibold tracking-tight">{{ t('site.team.members') }}</h2>
        <ul class="m-0 list-none overflow-hidden rounded-xl border p-0">
          <li v-for="m in members" :key="m.id" class="grid gap-2 border-b px-4 py-3 last:border-b-0">
            <div class="grid gap-x-4 gap-y-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <div class="grid min-w-0 gap-0.5">
                <p class="flex flex-wrap items-center gap-2 font-medium"><span class="[overflow-wrap:anywhere]">{{ m.email ?? noEmail }}</span><Badge as="span" variant="soft">{{ roleLabel(m.role) }}</Badge></p>
                <ul v-if="m.role === 'staff'" class="m-0 grid list-none gap-0.5 p-0 text-[13px] text-muted-foreground">
                  <li v-for="line in grantLines(m.grants)" :key="line">{{ line }}</li>
                  <li v-if="!grantLines(m.grants).length">{{ t('site.team.noRights') }}</li>
                </ul>
              </div>
              <div v-if="editing?.id !== m.id && confirming !== m.id" class="flex flex-wrap items-center gap-2">
                <Button v-if="m.role === 'staff'" type="button" variant="secondary" size="sm" @click="startEdit(m.id, m.grants)">{{ t('site.team.changeRights') }}</Button>
                <Button v-if="m.role !== 'owner' || ownerCount > 1" type="button" variant="ghost" size="sm" class="text-destructive hover:text-destructive" @click="startRemove(m.id)">{{ t('site.common.remove') }}</Button>
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
              <p><T k="site.team.losesAccess" :params="{ email: m.email ?? noEmail, site: s.site.value?.name ?? t('site.fallback.site') }"><template #email="{ text }"><strong>{{ text }}</strong></template></T></p>
              <div class="flex flex-wrap gap-2">
                <Button type="button" variant="destructive" size="sm" :disabled="memberBusy" @click="confirmRemove(m.id)">{{ t('site.common.remove') }}</Button>
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
            <Button type="button" variant="secondary" size="sm" @click="revoke(i.id)">{{ t('site.team.revokeInvite') }}</Button>
          </li>
        </ul>
      </section>

      <section class="grid gap-3">
        <Button v-if="!inviting" type="button" class="justify-self-start" @click="openForm">{{ t('site.team.invite') }}</Button>
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
            <Button type="submit" :disabled="sending">{{ t('site.team.sendInvite') }}</Button>
            <Button type="button" variant="ghost" :disabled="sending" @click="inviting = false">{{ t('site.common.cancel') }}</Button>
          </div>
        </form>
      </section>
    </template>
  </main>
</template>
