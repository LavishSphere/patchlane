import { useEffect, useState } from 'react'
import { loadRecordingIndex } from '../api/patchlane'

/**
 * The bundled recordings listed in public/recordings/index.json.
 * status: loading | ready | missing. When the index is missing, list is empty
 * and replay plays the golden recording only.
 */
export function useRecordings() {
  const [state, setState] = useState({ status: 'loading', list: [] })

  useEffect(() => {
    let cancelled = false
    loadRecordingIndex()
      .then((list) => {
        if (!cancelled) setState({ status: 'ready', list })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'missing', list: [] })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
