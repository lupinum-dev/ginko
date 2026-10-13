// `ginko export` (SPEC 9, 12): schema, entries and files of the hosted site in a folder.
//   <dir>/export.json      the platform's answer without the signed URLs, plus `path` per file
//   <dir>/files/<id><ext>  every file, downloaded with a plain request (the storage URL is signed)
// A folder, not a ZIP: GitHub's upload-artifact zips it. export.json is written last, so a folder
// that has it is complete.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CliError, type SiteExport } from './model.ts'
import type { Platform } from './platform.ts'

export interface ExportInput {
  platform: Platform
  site: string
  /** Target folder; it must be missing or empty. */
  dir: string
  /** Plain fetch without credentials; the file URLs carry their own signature. */
  fetch: (url: string) => Promise<Response>
  log: (line: string) => void
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/avif': '.avif', 'application/pdf': '.pdf',
}

/** The site named by a push key `ginko_<site>_<32>`. The key is not part of any message. */
export function siteOfKey(key: string): string {
  const match = /^ginko_([a-z][a-z0-9-]{1,40})_[a-z0-9]{32}$/.exec(key.trim())
  if (!match) throw new CliError('GINKO_KEY is not a valid key.', 'USAGE')
  return match[1]!
}

/** The folder `ginko export` writes to when no folder is given: `ginko-export-<site>-<YYYY-MM-DD>` in the working folder. */
export function defaultDir(site: string, now: Date): string {
  return `ginko-export-${site}-${now.toISOString().slice(0, 10)}`
}

/** Where a file lies in the export folder, relative to it. */
export function pathOf(file: { id: string; mime: string }): string {
  return `files/${file.id}${EXTENSIONS[file.mime] ?? ''}`
}

/** Refuses a folder that already holds something; a missing or empty one is fine. */
async function requireEmpty(dir: string) {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return
    if (code === 'ENOTDIR') throw new CliError(`“${dir}” is not a folder.`, 'USAGE')
    throw error
  }
  if (names.length > 0) throw new CliError(`The folder “${dir}” is not empty. Choose a new folder.`, 'USAGE')
}

export async function exportSite(input: ExportInput): Promise<{ dir: string; entries: number; files: number }> {
  const { dir } = input
  await requireEmpty(dir)
  const answer = await input.platform.exportSite(input.site)

  await mkdir(join(dir, 'files'), { recursive: true })
  try {
    const files: SiteExport['files'] = []
    for (const file of answer.files) {
      const { url, ...info } = file
      const path = pathOf(file)
      let bytes: Uint8Array
      try {
        const response = await input.fetch(url)
        if (!response.ok) throw new CliError(`The file “${file.name}” could not be downloaded (HTTP ${response.status}).`, 'UNAVAILABLE')
        bytes = new Uint8Array(await response.arrayBuffer())
      } catch (error) {
        if (error instanceof CliError) throw error
        throw new CliError(`The file “${file.name}” could not be downloaded.`, 'UNAVAILABLE')
      }
      if (bytes.byteLength !== file.size) {
        throw new CliError(`The file “${file.name}” is incomplete: ${bytes.byteLength} instead of ${file.size} bytes.`, 'UNAVAILABLE')
      }
      await writeFile(join(dir, path), bytes)
      files.push({ ...info, path })
      input.log(`File ${files.length}/${answer.files.length}: ${path}`)
    }
    const out: SiteExport = { ...answer, files }
    await writeFile(join(dir, 'export.json'), `${JSON.stringify(out, null, 2)}\n`)
  } catch (error) {
    // A folder without export.json would look like a finished export; nothing in it was there before.
    await rm(dir, { recursive: true, force: true })
    throw error
  }
  return { dir, entries: answer.entries.length, files: answer.files.length }
}
