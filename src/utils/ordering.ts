/**
 * The order of related companies — in the panel's lists AND in the graph's
 * tree, which is why it lives here: the two must agree. Scrolling down the
 * subsidiary list lights up the graph's boxes one after the other; with the
 * tree in an order of its own (it once sorted by box width) the highlight
 * jumped about at random.
 */
export function byStakeDesc<T>(getStake: (x: T) => number | null | undefined,
                               getName: (x: T) => string,
                               getShares?: (x: T) => number | null | undefined) {
  // Three tiers: rows with a percentage (desc), then rows that only know a
  // share count (desc — a 13F holding in a company with no known shares
  // outstanding is still bigger or smaller than its neighbours), then name.
  // Percent and shares are never compared with each other: a percent needs a
  // denominator and a bare count doesn't have one, so ordering across the two
  // would be a guess dressed as a ranking.
  return (a: T, b: T) => {
    const sa = getStake(a), sb = getStake(b)
    if (sa != null && sb != null && sa !== sb) return sb - sa
    if (sa != null && sb == null) return -1
    if (sa == null && sb != null) return 1
    if (sa == null && sb == null) {
      const ha = getShares?.(a), hb = getShares?.(b)
      if (ha != null && hb != null && ha !== hb) return hb - ha
      if (ha != null && hb == null) return -1
      if (ha == null && hb != null) return 1
    }
    return getName(a).localeCompare(getName(b))
  }
}
