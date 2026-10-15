// Whether a dish is on the menu and whether it is sold out on a day. The menu page, the allergen key and the
// JSON-LD menu read this one rule.

/**
 * A dish (`menu()`) on `date`: `shown` is false when it was taken off the menu (`onMenu: false`), `soldOut` is true when
 * it is marked sold out that day (`soldOutOn`). A missing or cleared field means on the menu and not sold out.
 */
export function dishOn(dish: { onMenu?: boolean | null; soldOutOn?: string | null }, date: string): { shown: boolean; soldOut: boolean } {
  return { shown: dish.onMenu !== false, soldOut: dish.soldOutOn === date }
}
