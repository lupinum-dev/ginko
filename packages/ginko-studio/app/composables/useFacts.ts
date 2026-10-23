// The queries behind the facts in the Studio (utils/facts): the site's facts with their values, and the texts that
// quote the facts of one brick.
import { api } from '#convex/api'
import { factNames, type ComponentRegistry, type Schema } from '@lupinum/ginko/internal'
import { computed, provide } from 'vue'
import { EDITOR_FACTS, FACT_USES, type FactQuote, type FactUses } from '../utils/facts'

/** For the site layout: every text editor below asks for the site's facts in its language (EDITOR_FACTS). */
export function provideEditorFacts(site: () => string, components: () => ComponentRegistry | undefined): void {
  provide(EDITOR_FACTS, (locale) => {
    const { data } = useConvexQuery(api.facts.values, () => (factNames(components()).length ? { site: site(), ...(locale() ? { locale: locale() } : {}) } : 'skip'))
    return { values: () => data.value, slug: site }
  })
}

/** The texts that quote the facts of `brick`, by field key, when the brick has facts (else no query runs). */
export function useFactUses(site: () => string, schema: () => Schema, brick: () => string): FactUses {
  const fields = computed(() => new Set(factNames(schema().components).filter((name) => name.startsWith(`${brick()}.`)).map((name) => name.slice(brick().length + 1))))
  const { data } = useConvexQuery(api.facts.uses, () => (fields.value.size ? { site: site(), brick: brick() } : 'skip'))
  return {
    slug: site,
    fields: () => fields.value,
    quotes: () => {
      if (!data.value) return undefined
      const byField: Record<string, FactQuote[]> = {}
      for (const [name, quotes] of Object.entries(data.value)) byField[name.slice(brick().length + 1)] = quotes
      return byField
    },
  }
}

/** For the form of an entry of `brick`: its fields (EntryFields) show which texts quote them. */
export function provideFactUses(site: () => string, schema: () => Schema, brick: () => string): void {
  provide(FACT_USES, useFactUses(site, schema, brick))
}
