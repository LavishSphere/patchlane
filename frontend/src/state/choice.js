// The operator's incident choice: one safeguard and how it breaks, and
// optionally a second safeguard broken in the same incident. Only pairs from
// GET /api/pairs can be combined. Every id comes from GET /api/cases.

// Saved for this browser session only:
// { caseId, variantId, second, secondCaseId, secondVariantId }
const CHOICE_KEY = 'patchlane.incidentChoice'
const OLD_CASE_KEY = 'patchlane.caseId'
const DEFAULT_CASE = 'ownership-check'
const DEFAULT_VARIANT = 'default'

const str = (v) => (typeof v === 'string' && v ? v : null)

export function savedChoice() {
  try {
    const raw = window.sessionStorage.getItem(CHOICE_KEY)
    if (raw) {
      const value = JSON.parse(raw)
      return {
        caseId: str(value?.caseId),
        variantId: str(value?.variantId),
        second: value?.second === true,
        secondCaseId: str(value?.secondCaseId),
        secondVariantId: str(value?.secondVariantId),
      }
    }
    return { caseId: window.sessionStorage.getItem(OLD_CASE_KEY) || null, variantId: null, second: false }
  } catch {
    return { caseId: null, variantId: null, second: false }
  }
}

export function saveChoice(choice) {
  try {
    window.sessionStorage.setItem(CHOICE_KEY, JSON.stringify(choice))
  } catch {
    /* storage unavailable: the choice lasts until the page reloads */
  }
}

const variantsOf = (c) => (Array.isArray(c?.variants) ? c.variants : [])
const sideKey = (caseId, variantId) => `${caseId}@${variantId ?? DEFAULT_VARIANT}`
const SIDE = /^[^@\s]+@[^@\s]+$/

/**
 * GET /api/pairs as a lookup from "caseId@variantId" to the set of sides it may
 * be paired with. null when the answer has no usable pairs.
 */
export function pairIndex(data) {
  const list = Array.isArray(data?.pairs) ? data.pairs : []
  const index = new Map()
  const add = (a, b) => {
    if (!index.has(a)) index.set(a, new Set())
    index.get(a).add(b)
  }
  for (const pair of list) {
    if (!Array.isArray(pair) || pair.length !== 2) continue
    const [a, b] = pair
    if (typeof a !== 'string' || typeof b !== 'string' || !SIDE.test(a) || !SIDE.test(b)) continue
    if (a.split('@')[0] === b.split('@')[0]) continue
    add(a, b)
    add(b, a)
  }
  return index.size ? index : null
}

/**
 * The cases that can be the second bug next to the given first choice, each
 * with only the variants allowed in a pair with it. Case and variant order
 * follow GET /api/cases.
 */
export function secondOptions(cases, index, caseId, variantId) {
  const partners = index?.get(sideKey(caseId, variantId))
  if (!partners) return []
  const out = []
  for (const c of cases) {
    if (c.id === caseId) continue
    const variants = variantsOf(c).filter((v) => partners.has(sideKey(c.id, v.id)))
    if (variants.length) out.push({ case: c, variants })
  }
  return out
}

/**
 * The saved choice made valid against the current cases and pairs. Unknown ids
 * fall back to the default case and its first break. A second bug that is no
 * longer allowed is swapped for the first allowed one, or turned off when none
 * is. Without a pair list there is no second bug.
 */
export function resolveChoice(cases, index, choice) {
  const found = cases.find((c) => c.id === choice.caseId)
  const first = found ?? cases.find((c) => c.id === DEFAULT_CASE) ?? cases[0]
  const variants = variantsOf(first)
  const variant = (found && variants.find((v) => v.id === choice.variantId)) || variants[0] || null
  const out = {
    caseId: first.id,
    variantId: variant?.id ?? null,
    second: false,
    secondCaseId: choice.secondCaseId ?? null,
    secondVariantId: choice.secondVariantId ?? null,
  }
  if (!choice.second || !index) return out

  const options = secondOptions(cases, index, out.caseId, out.variantId)
  if (!options.length) return out
  const same = options.find((o) => o.case.id === choice.secondCaseId)
  const option = same ?? options[0]
  const secondVariant = (same && option.variants.find((v) => v.id === choice.secondVariantId)) || option.variants[0]
  return { ...out, second: true, secondCaseId: option.case.id, secondVariantId: secondVariant.id }
}
