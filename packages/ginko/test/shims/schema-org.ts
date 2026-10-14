// '#ginko/schema-org' as the module writes it for a site without nuxt-schema-org: nothing to call.
// A test calls `installSchemaOrg` to stand in for a site that installs it (ES module bindings are live).
import type { Ref } from 'vue'
type Use = (nodes: Ref<Record<string, unknown>[]>) => unknown
export let useSchemaOrg: Use | undefined
export function installSchemaOrg(use: Use | undefined) { useSchemaOrg = use }
