// "Who did it" as the server sends it (ginko-server convex/lib/names.ts): an email, or a kind the Studio words.
import type { api } from '#convex/api'
import type { FunctionReturnType } from 'convex/server'

export type Who = FunctionReturnType<typeof api.changes.get>['who']
type Kind = Extract<Who, { kind: string }>['kind']
// Only the keys this file uses, so the Studio's typed `t` fits without a cast.
type T = ((key: `who.${Kind}` | 'who.viaAi') => string) & ((key: 'who.via', params: { agent: string }) => string)

/** The person in the Studio's language: their email, or "A team member", "Site support", … */
export function whoText(who: Who, t: T): string {
  return 'email' in who ? who.email : t(`who.${who.kind}`)
}

/** The person, plus "via AI (label)" when an AI key made the change. */
export function byText(who: Who, via: string | undefined, agent: string | null, t: T): string {
  const name = whoText(who, t)
  if (via !== 'agent') return name
  return `${name} ${agent ? t('who.via', { agent }) : t('who.viaAi')}`
}
