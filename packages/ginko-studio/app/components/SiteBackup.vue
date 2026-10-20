<!-- "Sicherung" on the team page (owners and admins): every entry and file of the site as a ZIP built in this browser,
     in the folder layout of `ginko export` (utils/backup.ts). Chrome and Edge stream it into a file the person picks,
     with no size limit; other browsers hold it in memory, so above 1 GB they say so before any file loads. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { DownloadIcon } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'
import { makeZip } from 'client-zip'
import { opErrorOf } from '../composables/useOps'
import { BackupFileError, backupBytes, backupEntries, backupName } from '../utils/backup'
import { sizeText } from '../utils/size'

const props = defineProps<{ slug: string }>()
const { t, format } = useI18n()
const convex = useConvex()

/** The most a browser without a file stream builds in memory. */
const MEMORY_LIMIT = 1024 ** 3

// Chromium's File System Access API is not in TypeScript's DOM types.
type SavePicker = (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle>
const savePicker = (): SavePicker | undefined => (window as Window & { showSaveFilePicker?: SavePicker }).showSaveFilePicker

const busy = ref(false)
const summary = ref<{ count: number; bytes: number } | null>(null)
const done = ref<number | null>(null)
const message = ref<{ text: string; tone: 'ok' | 'err' } | null>(null)

/** Reads the whole ZIP stream. Unlike `Response.blob()`, a failing file keeps its own error. */
async function inMemory(zip: ReadableStream<Uint8Array>): Promise<Blob> {
  const parts: Uint8Array[] = []
  const reader = zip.getReader()
  for (let next = await reader.read(); !next.done; next = await reader.read()) parts.push(next.value)
  // The chunks are ordinary ArrayBuffer bytes; TypeScript types any stream chunk as possibly shared memory, which Blob refuses.
  return new Blob(parts as BlobPart[], { type: 'application/zip' })
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  // The download has started from the URL by then; a later revoke keeps slow browsers from losing it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

async function download() {
  message.value = null
  summary.value = null
  done.value = null
  const now = new Date()
  const name = backupName(props.slug, now)
  // Where to save is asked first, while the click still counts as the person's own action (the browser requires it).
  let file: FileSystemWritableFileStream | null = null
  const picker = savePicker()
  if (picker) {
    try {
      file = await (await picker({ suggestedName: name, types: [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }] })).createWritable()
    } catch (error) {
      // Closing the dialog cancels; any other refusal falls back to the download in memory.
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }

  busy.value = true
  try {
    const answer = await convex.query(api.backup.download, { site: props.slug })
    summary.value = { count: answer.files.length, bytes: backupBytes(answer) }
    if (!file && summary.value.bytes > MEMORY_LIMIT) {
      message.value = { text: t('site.backup.tooBig', { size: sizeText(summary.value.bytes, format.number) }), tone: 'err' }
      return
    }
    done.value = 0
    const zip = makeZip(backupEntries(answer, { now, fetch: (url) => fetch(url), progress: (count) => { done.value = count } }))
    // A failed pipe aborts the file, so no half backup stays on disk.
    if (file) await zip.pipeTo(file)
    else save(await inMemory(zip), name)
    message.value = { text: t('site.backup.done'), tone: 'ok' }
  } catch (error) {
    await file?.abort().catch(() => {})
    message.value = { text: error instanceof BackupFileError ? t('site.backup.failed', { name: error.file }) : opErrorOf(error).message, tone: 'err' }
  } finally {
    busy.value = false
    done.value = null
  }
}
</script>

<template>
  <section class="rounded-xl border bg-card" aria-labelledby="backup-title">
    <h2 id="backup-title" class="px-4 pt-3 text-[15px] font-semibold tracking-tight">{{ t('site.backup.heading') }}</h2>
    <div class="grid gap-3 px-4 pt-1 pb-4">
      <p class="text-[13px] text-muted-foreground">{{ t('site.backup.lead') }}</p>
      <!-- Block layout: the empty status region takes no room, and it stays in the page so its first message is read. -->
      <div>
        <Button type="button" variant="outline" size="sm" :disabled="busy" @click="download"><DownloadIcon aria-hidden="true" />{{ t('site.backup.button') }}</Button>
        <div class="text-[13px] [&>p]:mt-2" aria-live="polite">
          <p v-if="summary?.count" class="text-muted-foreground tabular-nums">{{ t('site.backup.size', { count: summary.count, size: sizeText(summary.bytes, format.number) }) }}</p>
          <p v-if="done !== null && summary?.count" class="text-muted-foreground tabular-nums">{{ t('site.backup.progress', { done, total: summary.count }) }}</p>
          <p v-if="message" :class="message.tone === 'err' ? 'font-semibold text-destructive' : 'text-muted-foreground'">{{ message.text }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
