// The operator's scenario: one to three safeguards to break, each with how it
// breaks. Every id comes from GET /api/cases. The list order is the order the
// safeguards were ticked, and it becomes Bug 1, Bug 2 and Bug 3.

// Saved for this browser session only, as a list of { caseId, variantId }.
const SCENARIO_KEY = 'patchlane.scenario'
// Older saved shapes, read once and then removed:
// { caseId, variantId, second, secondCaseId, secondVariantId } and a bare case id.
const OLD_CHOICE_KEY = 'patchlane.incidentChoice'
const OLD_CASE_KEY = 'patchlane.caseId'

export const MAX_BUGS = 3
const DEFAULT_CASE = 'ownership-check'
const DEFAULT_VARIANT = 'default'

const str = (v) => (typeof v === 'string' && v ? v : null)

function cleanList(value) {
  if (!Array.isArray(value)) return null
  return value
    .map((item) => ({ caseId: str(item?.caseId), variantId: str(item?.variantId) }))
    .filter((item) => item.caseId)
}

/** The old single or two-bug choice as a scenario list. */
function migrate(old) {
  const list = []
  if (str(old?.caseId)) list.push({ caseId: old.caseId, variantId: str(old.variantId) })
  if (old?.second === true && str(old?.secondCaseId)) list.push({ caseId: old.secondCaseId, variantId: str(old.secondVariantId) })
  return list.length ? list : null
}

/** The saved scenario, or null when this session has none. */
export function savedScenario() {
  try {
    const storage = window.sessionStorage
    const raw = storage.getItem(SCENARIO_KEY)
    if (raw) return cleanList(JSON.parse(raw))

    const oldRaw = storage.getItem(OLD_CHOICE_KEY)
    const oldCase = storage.getItem(OLD_CASE_KEY)
    const list = oldRaw ? migrate(JSON.parse(oldRaw)) : oldCase ? [{ caseId: oldCase, variantId: null }] : null
    if (list) storage.setItem(SCENARIO_KEY, JSON.stringify(list))
    storage.removeItem(OLD_CHOICE_KEY)
    storage.removeItem(OLD_CASE_KEY)
    return list
  } catch {
    return null
  }
}

export function saveScenario(list) {
  try {
    window.sessionStorage.setItem(SCENARIO_KEY, JSON.stringify(list))
  } catch {
    /* storage unavailable: the scenario lasts until the page reloads */
  }
}

const variantsOf = (c) => (Array.isArray(c?.variants) ? c.variants : [])

function defaultScenario(cases) {
  const first = cases.find((c) => c.id === DEFAULT_CASE) ?? cases[0]
  if (!first) return [{ caseId: DEFAULT_CASE, variantId: DEFAULT_VARIANT }]
  return [{ caseId: first.id, variantId: variantsOf(first)[0]?.id ?? DEFAULT_VARIANT }]
}

/**
 * The saved scenario made valid against the current cases. Unknown cases and
 * repeats are dropped, an unknown break becomes the case's first one, and the
 * list is cut to three. With nothing saved, or nothing left after dropping
 * stale ids, the default case with its default break is ticked. An empty list
 * the operator made by unticking everything stays empty.
 */
export function resolveScenario(cases, list) {
  if (list == null) return defaultScenario(cases)
  if (!cases.length) return list.slice(0, MAX_BUGS).map((b) => ({ caseId: b.caseId, variantId: b.variantId ?? DEFAULT_VARIANT }))
  if (!list.length) return []

  const out = []
  for (const item of list) {
    const c = cases.find((x) => x.id === item.caseId)
    if (!c || out.some((b) => b.caseId === c.id)) continue
    const variants = variantsOf(c)
    const variant = variants.find((v) => v.id === item.variantId) ?? variants[0]
    out.push({ caseId: c.id, variantId: variant?.id ?? DEFAULT_VARIANT })
    if (out.length === MAX_BUGS) break
  }
  return out.length ? out : defaultScenario(cases)
}

/** "case@variant,case@variant": the form GET /api/scenarios/check takes. */
export function scenarioKey(list) {
  return list.map((b) => `${b.caseId}@${b.variantId ?? DEFAULT_VARIANT}`).join(',')
}

/** A lower-case reason from the API as a sentence: capital first letter, one final period. */
export function asSentence(text) {
  const t = String(text ?? '')
    .trim()
    .replace(/[.\s]+$/, '')
  return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}.` : ''
}
