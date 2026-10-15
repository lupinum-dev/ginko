// The Studio's backup (Team > Sicherung): the answer of `backup.download` as the folder `ginko export` writes, as ZIP
// entries built in the browser. The ZIP holds one folder `ginko-export-<site>-<date>/` with every file at its `pathOf`
// and `export.json` last, as the CLI writes it, so an unzipped backup is what `local:import` reads.
import { defaultDir, pathOf } from '@lupinum/ginko/internal'

/** What the ZIP needs of the server's answer; everything else in it (and in each file) goes into export.json as it is. */
export interface BackupAnswer {
  site: string
  files: BackupFile[]
}
interface BackupFile { id: string; name: string; mime: string; size: number; url: string }

/** A file that could not be loaded, or came back with another number of bytes: the backup stops and names it. */
export class BackupFileError extends Error {
  constructor(readonly file: string) {
    super(`The file “${file}” could not be loaded.`)
  }
}

/** The bytes of all files: about what the ZIP weighs (export.json and the ZIP's own records add a little). */
export const backupBytes = (answer: BackupAnswer): number => answer.files.reduce((sum, file) => sum + file.size, 0)

/** The name of the ZIP file: the export folder's name. */
export const backupName = (site: string, now: Date): string => `${defaultDir(site, now)}.zip`

/**
 * The ZIP entries, one at a time. Each file is fetched only when the ZIP asks for it, so a ZIP streamed to disk holds
 * one file in memory. Its size is checked as `ginko export` checks it: a short download must not become a backup that
 * silently misses a file. `progress` gets the number of files the ZIP has taken.
 */
export async function* backupEntries(answer: BackupAnswer, options: { now: Date; fetch: (url: string) => Promise<Response>; progress?: (done: number) => void }) {
  const dir = defaultDir(answer.site, options.now)
  const files: (Omit<BackupFile, 'url'> & { path: string })[] = []
  for (const file of answer.files) {
    const { url, ...info } = file
    const path = pathOf(file)
    let bytes: Uint8Array
    try {
      const response = await options.fetch(url)
      if (!response.ok) throw new BackupFileError(file.name)
      bytes = new Uint8Array(await response.arrayBuffer())
    } catch {
      throw new BackupFileError(file.name)
    }
    if (bytes.byteLength !== file.size) throw new BackupFileError(file.name)
    yield { name: `${dir}/${path}`, input: bytes, lastModified: options.now }
    files.push({ ...info, path })
    options.progress?.(files.length)
  }
  yield { name: `${dir}/export.json`, input: `${JSON.stringify({ ...answer, files }, null, 2)}\n`, lastModified: options.now }
}
