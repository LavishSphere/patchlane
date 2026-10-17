import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { loadRecording } from '../api/patchlane'
import { frameToAction, initialState, reducer } from './reducer'

// Idle stretches longer than this are shortened, e.g. the minutes between the
// end of a run and the recorder's final snapshot.
const MAX_GAP_MS = 10_000
const COMPRESSED_GAP_MS = 1_500
const TICK_MS = 120

// The recording pauses where a human acts in the live demo: after detection
// (the operator clicks Investigate) and at the approval request. Each entry
// lists the events that still belong to that moment.
const CHECKPOINTS = {
  detected: ['incident.detected'],
  awaiting_approval: ['approval.requested'],
}

export function parseRecording(text) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const frames = []
  for (const line of lines) {
    try {
      const row = JSON.parse(line)
      if ((row.kind === 'incident' || row.kind === 'event') && row.data) {
        frames.push({ kind: row.kind, data: row.data, orig: Date.parse(row.at) })
      }
    } catch {
      /* skip a malformed line rather than failing the whole replay */
    }
  }
  if (!frames.length) throw new Error('The recording is empty')

  let t = 0
  frames.forEach((frame, i) => {
    if (i > 0) {
      const gap = Math.max(0, frame.orig - frames[i - 1].orig)
      t += gap > MAX_GAP_MS ? COMPRESSED_GAP_MS : gap
    }
    frame.t = t
  })

  // checkpoint index = "pause before dispatching this frame"
  const checkpoints = new Map()
  for (const [status, followers] of Object.entries(CHECKPOINTS)) {
    const at = frames.findIndex((f) => f.kind === 'incident' && f.data.status === status)
    if (at < 0) continue
    let j = at + 1
    while (j < frames.length && frames[j].kind === 'event' && followers.includes(frames[j].data.type)) j++
    if (j < frames.length) checkpoints.set(j, status)
  }

  const first = frames.find((f) => f.kind === 'incident')?.data
  return {
    frames,
    checkpoints,
    duration: frames[frames.length - 1].t,
    startedAt: frames[0].orig,
    incidentId: first?.id ?? null,
    caseId: first?.caseId ?? null,
  }
}

function reduceFrames(frames, count) {
  let state = initialState
  for (let i = 0; i < count; i++) state = reducer(state, frameToAction(frames[i]))
  return state
}

/** Recording time (epoch ms) at a compressed playback position. */
function originalTimeAt(recording, pos) {
  const { frames } = recording
  let i = 0
  while (i + 1 < frames.length && frames[i + 1].t <= pos) i++
  const next = frames[i + 1]
  const span = next ? next.orig - frames[i].orig : Infinity
  return frames[i].orig + Math.min(Math.max(0, pos - frames[i].t), span)
}

/** Resolve `?at=` into a frame count: a status name, "end", or seconds. */
function resolveAt(recording, at) {
  if (at == null || at === '') return null
  const { frames, checkpoints } = recording
  if (at === 'end') return { index: frames.length }
  const secs = Number(at)
  if (!Number.isNaN(secs)) {
    const ms = secs * 1000
    return { index: frames.filter((f) => f.t <= ms).length, pos: ms }
  }
  for (const [index, status] of checkpoints) if (status === at) return { index }
  const first = frames.findIndex((f) => f.kind === 'incident' && f.data.status === at)
  if (first < 0) return null
  // Include everything that happened at the same moment as that snapshot.
  let index = first + 1
  while (index < frames.length && frames[index].kind === 'event' && frames[index].t - frames[first].t < 50) index++
  return { index }
}

/**
 * Plays one recording at a time. `name` is the recording to start with (null
 * while the caller is still deciding); `?at=` and `?play=` apply to that first
 * load only. `choose(name, { play })` switches to another recording later.
 */
export function useReplay({ enabled, name, initialAt = null, initialSpeed = 1, autoplay = false }) {
  const [recording, setRecording] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [source, setSource] = useState(null)
  const [data, dispatch] = useReducer(reducer, initialState)
  // loading | idle | playing | paused | checkpoint | ended | error
  const [player, setPlayerState] = useState({ status: 'loading', checkpoint: null })
  const [position, setPosition] = useState(0)
  const [speed, setSpeedState] = useState(initialSpeed)

  const rec = useRef(null)
  const idx = useRef(0)
  const pos = useRef(0)
  const lastReal = useRef(0)
  const speedRef = useRef(initialSpeed)
  const passed = useRef(new Set())
  const statusRef = useRef('loading')
  // The recording a visitor picked after the first one: { name, play }.
  const [picked, setPicked] = useState(null)
  const want = picked?.name ?? name
  const loadedName = useRef(null)
  const firstDone = useRef(false)

  const setPlayer = useCallback((status) => {
    statusRef.current = status
    const checkpoint = status === 'checkpoint' ? rec.current?.checkpoints.get(idx.current) ?? null : null
    setPlayerState({ status, checkpoint })
  }, [])

  /** Jump to "the first k frames have happened" (and pos ms, if given). */
  const seekIndex = useCallback(
    (index, at) => {
      const recording = rec.current
      if (!recording) return
      const { frames, checkpoints } = recording
      const k = Math.max(0, Math.min(index, frames.length))
      dispatch({ type: 'load', state: reduceFrames(frames, k) })
      idx.current = k
      pos.current = at ?? (k > 0 ? frames[k - 1].t : 0)
      passed.current = new Set([...checkpoints.keys()].filter((c) => c < k))
      setPosition(pos.current)
      if (k >= frames.length) setPlayer('ended')
      else if (k === 0) setPlayer('idle')
      else if (checkpoints.has(k)) setPlayer('checkpoint')
      else setPlayer('paused')
    },
    [setPlayer],
  )

  // Load the wanted recording the first time replay is needed, and again
  // whenever another one is chosen. ?at= and ?play= apply to the first load.
  useEffect(() => {
    if (!enabled || !want || loadedName.current === want) return undefined
    loadedName.current = want
    const first = !firstDone.current
    const playAfter = first ? autoplay : Boolean(picked?.play)
    let cancelled = false
    let done = false
    loadRecording(want)
      .then(({ text, source: from }) => {
        if (cancelled) return
        done = true
        firstDone.current = true
        const parsed = parseRecording(text)
        rec.current = parsed
        setRecording(parsed)
        setSource(from)
        const target = first ? resolveAt(parsed, initialAt) : null
        if (target) {
          seekIndex(target.index, target.pos)
        } else {
          seekIndex(0)
          if (playAfter) {
            lastReal.current = performance.now()
            setPlayer('playing')
          }
        }
      })
      .catch((err) => {
        if (cancelled) return
        done = true
        firstDone.current = true
        setLoadError(err.message || 'Could not load the recording')
        setPlayer('error')
      })
    return () => {
      cancelled = true
      // An interrupted load starts over the next time this runs.
      if (!done) loadedName.current = null
    }
  }, [enabled, want, picked, initialAt, autoplay, seekIndex, setPlayer])

  // Playback loop.
  const playing = enabled && player.status === 'playing' && recording != null
  useEffect(() => {
    if (!playing) return undefined
    const current = rec.current
    const { frames, checkpoints, duration } = current
    lastReal.current = performance.now()
    const timer = setInterval(() => {
      // A tick that lands after a switch to another recording does nothing.
      if (rec.current !== current || statusRef.current !== 'playing') return
      const now = performance.now()
      let p = pos.current + (now - lastReal.current) * speedRef.current
      lastReal.current = now
      const actions = []
      let stopAt = null
      while (idx.current < frames.length && frames[idx.current].t <= p) {
        if (checkpoints.has(idx.current) && !passed.current.has(idx.current)) {
          stopAt = 'checkpoint'
          p = idx.current > 0 ? frames[idx.current - 1].t : 0
          break
        }
        actions.push(frameToAction(frames[idx.current]))
        idx.current++
      }
      if (!stopAt && idx.current >= frames.length) {
        stopAt = 'ended'
        p = duration
      }
      pos.current = Math.min(p, duration)
      if (actions.length) dispatch({ type: 'batch', actions })
      setPosition(pos.current)
      if (stopAt) setPlayer(stopAt)
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [playing, setPlayer])

  const play = useCallback(() => {
    if (!rec.current) return
    const current = statusRef.current
    if (current === 'ended') seekIndex(0)
    if (current === 'checkpoint') passed.current.add(idx.current)
    lastReal.current = performance.now()
    setPlayer('playing')
  }, [seekIndex, setPlayer])

  const pause = useCallback(() => {
    if (statusRef.current === 'playing') setPlayer('paused')
  }, [setPlayer])

  const restart = useCallback(() => seekIndex(0), [seekIndex])

  /** Switch to another recording: clear the incident and timeline, then load it from the start. */
  const choose = useCallback(
    (next, { play: playAfter = false } = {}) => {
      if (!next) return
      if (next === loadedName.current && rec.current) {
        seekIndex(0)
        if (playAfter) {
          lastReal.current = performance.now()
          setPlayer('playing')
        }
        return
      }
      rec.current = null
      loadedName.current = null
      firstDone.current = true
      idx.current = 0
      pos.current = 0
      passed.current = new Set()
      dispatch({ type: 'reset' })
      setRecording(null)
      setSource(null)
      setLoadError(null)
      setPosition(0)
      setPlayer('loading')
      setPicked({ name: next, play: playAfter })
    },
    [seekIndex, setPlayer],
  )

  const seek = useCallback(
    (ms) => {
      const recording = rec.current
      if (!recording) return
      const wasPlaying = statusRef.current === 'playing'
      const k = recording.frames.filter((f) => f.t <= ms).length
      seekIndex(k, ms)
      if (wasPlaying && k < recording.frames.length && !recording.checkpoints.has(k)) {
        lastReal.current = performance.now()
        setPlayer('playing')
      }
    },
    [seekIndex, setPlayer],
  )

  const setSpeed = useCallback((value) => {
    if (statusRef.current === 'playing') {
      const now = performance.now()
      pos.current += (now - lastReal.current) * speedRef.current
      lastReal.current = now
    }
    speedRef.current = value
    setSpeedState(value)
  }, [])

  const now = recording ? originalTimeAt(recording, position) : null

  return useMemo(
    () => ({
      data,
      name: want,
      status: player.status,
      checkpoint: player.checkpoint,
      error: loadError,
      source,
      position,
      duration: recording?.duration ?? 0,
      startedAt: recording?.startedAt ?? null,
      speed,
      now,
      play,
      pause,
      restart,
      seek,
      setSpeed,
      choose,
    }),
    [data, want, player, loadError, source, recording, position, speed, now, play, pause, restart, seek, setSpeed, choose],
  )
}
