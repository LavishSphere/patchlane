import { useEffect, useState } from 'react'
import { api } from '../api/patchlane'
import { pairIndex } from './choice'

const RETRY_MS = 60_000

/**
 * GET /api/pairs while operator mode is on. null until a list with at least one
 * pair arrives; the builder offers no second bug while it is null.
 */
export function usePairs(enabled) {
  const [index, setIndex] = useState(null)

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    let timer

    async function load() {
      try {
        const data = await api.pairs({ timeout: 6000 })
        if (cancelled) return
        const next = pairIndex(data)
        setIndex(next)
        if (next) return
      } catch {
        if (cancelled) return
      }
      timer = setTimeout(load, RETRY_MS)
    }

    load()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [enabled])

  return enabled ? index : null
}
