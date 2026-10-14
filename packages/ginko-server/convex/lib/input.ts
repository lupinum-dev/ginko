// Input rules shared by several functions (SPEC 3, 4, 11). Plain values and pure functions: the
// callers turn a failed check into `fail('INVALID', …)`.

/** A site slug (SPEC 2.1): the one rule for the schema, `sites.create` and the push key. */
export const SLUG_PATTERN = '[a-z][a-z0-9-]{1,40}'
export const SLUG = new RegExp(`^${SLUG_PATTERN}$`)

export const NAME_MAX = 100
export const SENTENCE_MAX = 200

/** A change sentence as stored: at most SENTENCE_MAX characters, cut with "…". A long title never blocks a save. */
export function storedSentence(sentence: string): string {
  const text = sentence.trim()
  return text.length > SENTENCE_MAX ? `${text.slice(0, SENTENCE_MAX - 1)}…` : text
}

/** The id of one user action: it is stored with the result and compared on every retry. */
export const OP_ID = /^[A-Za-z0-9_-]{1,64}$/

/** RFC 5321: an address has at most 254 characters. */
export const EMAIL_MAX = 254

/** `local@domain.tld`. Every class excludes `@` and the dot is the only separator, so a match needs one pass. */
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/

/** Length first, so no pattern ever runs on a long input. */
export function isEmail(email: string): boolean {
  return email.length <= EMAIL_MAX && EMAIL.test(email)
}

/** A revision (baseRev, lifeRev, orderRev …) is a count: NaN, fractions, negative and infinite numbers are no revision. */
export function isRev(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

/**
 * The first object key Convex would refuse (starts with `$`, has a character outside ASCII 32–126, or is longer than
 * 1024 characters), as a dotted path; undefined when every key is fine. Convex refuses such keys while it serializes
 * the arguments, before any handler runs, with an uncoded error; the JSON boundaries check them first.
 */
export function badKey(value: unknown, path = ''): string | undefined {
  if (Array.isArray(value)) {
    for (const [i, inner] of value.entries()) {
      const bad = badKey(inner, path ? `${path}.${i}` : String(i))
      if (bad) return bad
    }
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  for (const [key, inner] of Object.entries(value)) {
    const at = path ? `${path}.${key}` : key
    if (key.startsWith('$') || key.length > 1024 || /[^\x20-\x7e]/.test(key)) return at
    const bad = badKey(inner, at)
    if (bad) return bad
  }
  return undefined
}
