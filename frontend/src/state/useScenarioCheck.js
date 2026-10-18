import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../api/patchlane'
import { scenarioKey } from './choice'

const DEBOUNCE_MS = 150

/** An API message that is a sentence, or null for a JSON dump of validation errors. */
const plain = (message) => (typeof message === 'string' && message && !/^[[{]/.test(message) ? message : null)

/**
 * Whether the ticked bugs can run as one scenario, from GET /api/scenarios/check.
 * One bug is always allowed and is never sent. Answers for an older list are
 * ignored. When the check can't be reached the answer is 'unknown', and the
 * trigger stays allowed because the server enforces the same rule.
 *
 * Returns { key, state, reason } where state is
 * empty | checking | allowed | refused | unknown.
 */
export function useScenarioCheck(enabled, bugs) {
  const key = scenarioKey(bugs)
  const count = bugs.length
  const [result, setResult] = useState({ key: null, state: 'checking', reason: null })

  useEffect(() => {
    if (!enabled || count < 2) return undefined
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const data = await api.checkScenario(key, { signal: controller.signal, timeout: 6000 })
        if (controller.signal.aborted) return
        const allowed = data?.allowed !== false
        setResult({ key, state: allowed ? 'allowed' : 'refused', reason: allowed ? null : plain(data?.reason) })
      } catch (err) {
        if (controller.signal.aborted) return
        const reason = err instanceof ApiError && [404, 422].includes(err.status) ? plain(err.message) : null
        setResult({ key, state: reason ? 'refused' : 'unknown', reason })
      }
    }, DEBOUNCE_MS)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [enabled, key, count])

  return useMemo(() => {
    if (count === 0) return { key, state: 'empty', reason: null }
    if (count === 1) return { key, state: 'allowed', reason: null }
    if (!enabled) return { key, state: 'unknown', reason: null }
    if (result.key !== key) return { key, state: 'checking', reason: null }
    return result
  }, [count, enabled, key, result])
}
