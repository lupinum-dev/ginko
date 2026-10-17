// `pnpm local:pull` (SPEC 9, monorepo only): production content into the local platform. It is `export` into a temporary
// folder, then `import`, then the folder is removed. The caller confirmed the local deployment first.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportSite, type ExportInput } from './export.ts'
import { importSite, type ImportInput } from './import.ts'

export async function pull(input: Omit<ExportInput, 'dir'> & Omit<ImportInput, 'dir'>): Promise<{ entries: number; files: number }> {
  const dir = await mkdtemp(join(tmpdir(), 'ginko-pull-'))
  try {
    await exportSite({ ...input, dir })
    // A rerun exports again: the temporary folder is gone by then.
    return await importSite({ ...input, dir, again: 'pnpm local:pull' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
