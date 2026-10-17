import { createContext, useContext, useEffect, useState } from 'react'

/** Wall-clock "now" for live mode, or the recording's clock during replay. */
export const ClockContext = createContext(() => Date.now())

export function useNow() {
  return useContext(ClockContext)()
}

/** Re-render every `ms` while `active`; returns Date.now(). */
export function useTicker(active, ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return undefined
    const timer = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(timer)
  }, [active, ms])
  return now
}
