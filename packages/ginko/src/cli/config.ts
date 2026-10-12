// Loads ginko.config.ts with Node's built-in type stripping (Node 22.19+ and 24, the engines of
// this repo), so no build step and no loader dependency. A changed file is read again with a
// new query string, which gives Node a fresh module instance.
import { pathToFileURL } from 'node:url'
import type { SiteInput } from '../core/index.ts'
import { CliError, isObject } from './model.ts'

export async function loadConfig(path: string, revision = 0): Promise<SiteInput> {
  const url = pathToFileURL(path).href + (revision > 0 ? `?rev=${revision}` : '')
  let module: unknown
  try {
    module = await import(url)
  } catch (error) {
    throw new CliError(`ginko.config.ts could not be loaded (${path}): ${error instanceof Error ? error.message : String(error)}`)
  }
  const config = isObject(module) ? module.default : undefined
  if (!isObject(config) || typeof config.site !== 'string' || !isObject(config.bricks)) {
    throw new CliError(`${path} needs a default export with defineSite(…).`)
  }
  return config as unknown as SiteInput
}
