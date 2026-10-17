import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { api, eventsUrl } from '../api/patchlane'
import { initialState, reducer } from './reducer'

const POLL_MS = 4000

/**
 * Live orchestrator state: GET /api/incidents/current, then the SSE stream for
 * that incident. `incident` messages replace the snapshot; `event` messages
 * append to the timeline (deduplicated in the reducer).
 */
export function useLive({ enabled, onUnreachable }) {
  const [data, dispatch] = useReducer(reducer, initialState)
  const [connection, setConnection] = useState('idle') // idle | connecting | open | polling | unreachable
  const source = useRef(null)
  const sourceId = useRef(null)
  const pollTimer = useRef(null)
  const syncRef = useRef(null)
  const everReached = useRef(false)
  const unreachableRef = useRef(onUnreachable)

  useEffect(() => {
    unreachableRef.current = onUnreachable
  }, [onUnreachable])

  const closeStream = useCallback(() => {
    source.current?.close()
    source.current = null
    sourceId.current = null
  }, [])

  const schedule = useCallback((ms = POLL_MS) => {
    clearTimeout(pollTimer.current)
    pollTimer.current = setTimeout(() => syncRef.current?.(), ms)
  }, [])

  const openStream = useCallback(
    (id) => {
      if (sourceId.current === id && source.current && source.current.readyState !== EventSource.CLOSED) return
      closeStream()
      const es = new EventSource(eventsUrl(id))
      source.current = es
      sourceId.current = id
      setConnection('connecting')
      es.addEventListener('open', () => setConnection('open'))
      es.addEventListener('incident', (e) => {
        try {
          dispatch({ type: 'incident', incident: JSON.parse(e.data) })
        } catch {
          /* ignore a malformed message */
        }
      })
      es.addEventListener('event', (e) => {
        try {
          dispatch({ type: 'event', event: JSON.parse(e.data) })
        } catch {
          /* ignore a malformed message */
        }
      })
      es.addEventListener('error', () => {
        // The server ends the stream when the incident is replaced or reset.
        // Either way, ask the API what is current now.
        if (es.readyState === EventSource.CLOSED) {
          if (source.current === es) {
            source.current = null
            sourceId.current = null
          }
          schedule(500)
        } else {
          setConnection('connecting')
          schedule(1500)
        }
      })
    },
    [closeStream, schedule],
  )

  const sync = useCallback(async () => {
    clearTimeout(pollTimer.current)
    try {
      const incident = await api.currentIncident({ timeout: 5000 })
      everReached.current = true
      if (!incident) {
        closeStream()
        dispatch({ type: 'reset' })
        setConnection('polling')
        schedule()
        return
      }
      dispatch({ type: 'incident', incident })
      openStream(incident.id)
      if (source.current?.readyState === EventSource.OPEN) setConnection('open')
    } catch {
      setConnection('unreachable')
      if (!everReached.current) {
        closeStream()
        unreachableRef.current?.()
        return
      }
      schedule(POLL_MS)
    }
  }, [closeStream, openStream, schedule])

  useEffect(() => {
    syncRef.current = sync
  }, [sync])

  useEffect(() => {
    if (!enabled) return undefined
    everReached.current = false
    const first = setTimeout(sync, 0)
    return () => {
      clearTimeout(first)
      clearTimeout(pollTimer.current)
      closeStream()
    }
  }, [enabled, sync, closeStream])

  /** Apply an Incident returned by an operator POST (trigger). */
  const applyIncident = useCallback(
    (incident) => {
      if (!incident) return
      dispatch({ type: 'incident', incident })
      openStream(incident.id)
    },
    [openStream],
  )

  const applyReset = useCallback(() => {
    closeStream()
    dispatch({ type: 'reset' })
    setConnection('polling')
    schedule()
  }, [closeStream, schedule])

  return useMemo(
    () => ({ data, connection, sync, applyIncident, applyReset }),
    [data, connection, sync, applyIncident, applyReset],
  )
}
