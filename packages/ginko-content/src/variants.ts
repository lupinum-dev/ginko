import { existsSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { IMAGE_URL_PREFIX, variantFiles } from './images.ts'

export interface Variant { width: number; url: string }

/**
 * Writes `<hash>-<width>.webp` into `dir` for an image of `width` px and returns the variants, ascending.
 * Names are content hashes, so an existing file is reused: restarts of the dev server do not encode again.
 * `names` collects every file name that belongs to the current build, for pruning.
 */
export async function makeVariants(path: string, hash: string, width: number, dir: string, names: Set<string>, counter?: { encoded: number }): Promise<Variant[]> {
  const out: Variant[] = []
  // Loaded here, not on import: `ginko check` never encodes, so it runs where sharp's native binary is missing.
  const sharp = (await import('sharp')).default
  for (const { width: w, name } of variantFiles(path, hash, width)) {
    names.add(name)
    const target = join(dir, name)
    if (!existsSync(target)) {
      const temp = `${target}.tmp`
      await sharp(readFileSync(path)).rotate().resize({ width: w }).webp().toFile(temp)
      renameSync(temp, target)
      if (counter) counter.encoded++
    }
    out.push({ width: w, url: `${IMAGE_URL_PREFIX}${name}` })
  }
  return out
}
