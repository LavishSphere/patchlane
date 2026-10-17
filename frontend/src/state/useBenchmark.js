import { useEffect, useState } from 'react'
import { api } from '../api/patchlane'

const REFRESH_MS = 60_000

/** GET /api/benchmark/latest (+ case titles). Never invents a result. */
export function useBenchmark() {
  const [state, setState] = useState({ status: 'loading', data: null, cases: [] })

  useEffect(() => {
    let cancelled = false
    let timer

    async function load() {
      const [bench, cases] = await Promise.allSettled([api.benchmark({ timeout: 6000 }), api.cases({ timeout: 6000 })])
      if (cancelled) return
      setState((prev) => ({
        status: bench.status === 'fulfilled' ? 'ready' : prev.data ? 'ready' : 'unreachable',
        data: bench.status === 'fulfilled' ? bench.value : prev.data,
        cases: cases.status === 'fulfilled' && Array.isArray(cases.value) ? cases.value : prev.cases,
      }))
      timer = setTimeout(load, REFRESH_MS)
    }

    load()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  return state
}
