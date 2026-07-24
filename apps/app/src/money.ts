/**
 * Shared price formatter. Prices are stored in integer cents; this renders them
 * for display without truncating cents (a $49.99 package must not read "$50"),
 * while dropping the ".00" tail on whole-dollar amounts so round prices stay
 * clean. Used by the storefront, the coach package list, and the checkout
 * submit label so the displayed amount always matches the actual charge.
 */
export function fmtPrice(amountCents: number, currency = "USD"): string {
  const cents = Math.round(amountCents ?? 0)
  const whole = cents % 100 === 0
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(cents / 100)
  } catch {
    // Unknown currency code → fall back to a plain "$" render.
    return `$${whole ? (cents / 100).toFixed(0) : (cents / 100).toFixed(2)}`
  }
}
