import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError, operatorToken } from './api/patchlane'
import Header, { Logo } from './components/Header'
import OperatorDialog from './components/OperatorDialog'
import ReplayBanner from './components/ReplayBanner'
import Toasts from './components/Toasts'
import { Container } from './components/ui'
import { statusPill } from './utils/status'
import Dashboard from './pages/Dashboard'
import { ClockContext, useTicker } from './state/clock'
import { MAX_BUGS, resolveScenario, saveScenario, savedScenario, scenarioKey } from './state/choice'
import { useBenchmark } from './state/useBenchmark'
import { useLive } from './state/useLive'
import { useRecordings } from './state/useRecordings'
import { useReplay } from './state/useReplay'
import { useScenarioCheck } from './state/useScenarioCheck'

// Replay can start at a given point: ?at=<status>|end|<seconds>, ?speed=4, ?play=1.
// ?recording=<name> picks a recording listed in public/recordings/index.json.
const params = new URLSearchParams(window.location.search)
const REPLAY_AT = params.get('at')
const REPLAY_SPEED = params.get('speed') === '4' ? 4 : 1
const REPLAY_AUTOPLAY = params.get('play') === '1'
const REPLAY_RECORDING = params.get('recording')
const GOLDEN = 'golden'

/** Put the chosen recording in the address bar so the link opens the same run. */
function syncRecordingParam(name) {
  try {
    const url = new URL(window.location.href)
    if (name === GOLDEN) url.searchParams.delete('recording')
    else url.searchParams.set('recording', name)
    url.searchParams.delete('at')
    url.searchParams.delete('play')
    window.history.replaceState(window.history.state, '', url)
  } catch {
    /* the address bar keeps its old value */
  }
}

export default function App() {
  const [token, setToken] = useState(() => operatorToken.get())
  const [liveDown, setLiveDown] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toasts, setToasts] = useState([])
  const [saved, setSaved] = useState(savedScenario)
  // A refusal from POST /api/demo/trigger, kept for the scenario it was about.
  const [refusal, setRefusal] = useState(null)
  const toastId = useRef(0)

  const mode = token && !liveDown ? 'live' : 'replay'

  const notify = useCallback((message, tone = 'warning') => {
    const id = ++toastId.current
    setToasts((list) => [...list.slice(-2), { id, message, tone }])
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 7000)
  }, [])

  // A token saved earlier in this tab is checked once on load; a rejected one goes back to replay.
  const checkedSaved = useRef(false)
  useEffect(() => {
    if (checkedSaved.current) return
    checkedSaved.current = true
    const saved = operatorToken.get()
    if (!saved) return
    api.checkToken(saved).catch((err) => {
      if (err instanceof ApiError && err.status === 401) {
        operatorToken.clear()
        setToken(null)
        notify('Incorrect operator token. The token saved in this tab was rejected, so operator mode is off.', 'incident')
      }
    })
  }, [notify])

  const onUnreachable = useCallback(() => {
    setLiveDown(true)
    notify('The Patchlane API is unreachable. Showing the recorded run.')
  }, [notify])

  const live = useLive({ enabled: mode === 'live', onUnreachable })
  const recordings = useRecordings()
  // ?recording= is used only when the index lists it; otherwise the golden run plays.
  const firstRecording = useMemo(() => {
    if (!REPLAY_RECORDING || REPLAY_RECORDING === GOLDEN) return GOLDEN
    if (recordings.status === 'loading') return null
    return recordings.list.some((r) => r.name === REPLAY_RECORDING) ? REPLAY_RECORDING : GOLDEN
  }, [recordings])
  const replay = useReplay({
    enabled: mode === 'replay',
    name: firstRecording,
    initialAt: REPLAY_AT,
    initialSpeed: REPLAY_SPEED,
    autoplay: REPLAY_AUTOPLAY,
  })
  const benchmark = useBenchmark()

  // The scenario the next trigger runs: the saved list with stale ids dropped, or the
  // default case and its default break when nothing usable is saved.
  const cases = benchmark.cases
  const scenario = useMemo(() => resolveScenario(cases, saved), [cases, saved])
  const update = useCallback((list) => {
    setSaved(list)
    saveScenario(list)
  }, [])
  // Once the cases are known, the saved copy loses its stale ids too.
  useEffect(() => {
    if (cases.length && saved && scenarioKey(saved) !== scenarioKey(scenario)) saveScenario(scenario)
  }, [cases, saved, scenario])
  const checked = useScenarioCheck(mode === 'live' && cases.length > 0, scenario)
  const check = useMemo(
    () => (refusal && refusal.key === checked.key ? { ...checked, state: 'refused', reason: refusal.reason } : checked),
    [refusal, checked],
  )

  // Recorded runs a visitor can switch between. Needs at least two in the index.
  const { choose: chooseReplay } = replay
  const chooseRecording = useCallback(
    (name, opts) => {
      chooseReplay(name, opts)
      syncRecordingParam(name)
    },
    [chooseReplay],
  )
  const gallery = useMemo(() => {
    if (mode !== 'replay' || recordings.list.length < 2) return null
    const selected = replay.name ?? GOLDEN
    const list = recordings.list.some((r) => r.name === selected)
      ? recordings.list
      : [{ name: selected, title: 'Recorded run' }, ...recordings.list]
    return { list, selected, choose: chooseRecording }
  }, [mode, recordings.list, replay.name, chooseRecording])

  const data = mode === 'live' ? live.data : replay.data
  const liveNow = useTicker(mode === 'live', 1000)
  const now = mode === 'live' ? liveNow : (replay.now ?? liveNow)
  const clock = useCallback(() => now, [now])

  // Operator actions: POSTs with the bearer token. Never used while replaying.
  const run = useCallback(
    async (call, onDone, onError) => {
      if (!token) return
      setBusy(true)
      try {
        const result = await call(token)
        onDone?.(result)
      } catch (err) {
        if (onError?.(err)) return
        if (err instanceof ApiError && err.status === 401) {
          operatorToken.clear()
          setToken(null)
          notify('Incorrect operator token. The server rejected it, so operator mode is off and the recorded run is showing.', 'incident')
        } else if (err instanceof ApiError) {
          notify(err.message)
        } else {
          notify('Could not reach the Patchlane API.')
        }
      } finally {
        setBusy(false)
      }
    },
    [token, notify],
  )

  const incidentId = live.data.incident?.id
  const { applyIncident, applyReset } = live
  const operator = useMemo(() => {
    if (mode !== 'live') return null
    const variantsOf = (id) => cases.find((c) => c.id === id)?.variants ?? []
    return {
      busy,
      cases,
      scenario,
      check,
      max: MAX_BUGS,
      // Trigger waits for the check and stays off for a refused scenario. A check that
      // couldn't be reached still allows it; the server applies the same rule.
      ready: scenario.length > 0 && !['empty', 'checking', 'refused'].includes(check.state),
      // A newly ticked safeguard starts from its default break and goes to the end of the list.
      toggle: (caseId, on) => {
        const rest = scenario.filter((b) => b.caseId !== caseId)
        if (!on) return update(rest)
        if (rest.length >= MAX_BUGS) return undefined
        return update([...rest, { caseId, variantId: variantsOf(caseId)[0]?.id ?? 'default' }])
      },
      chooseVariant: (caseId, variantId) =>
        update(scenario.map((b) => (b.caseId === caseId ? { caseId, variantId } : b))),
      trigger: () => {
        const key = scenarioKey(scenario)
        return run(
          (t) => api.trigger(t, scenario),
          applyIncident,
          // A refused combination is shown on the builder's status line, like the check's answer.
          (err) => {
            const reason = err instanceof ApiError && err.status === 422 && !/^[[{]/.test(err.message) ? err.message : null
            if (reason) setRefusal({ key, reason })
            return Boolean(reason)
          },
        )
      },
      // The SSE stream carries the investigation; the 202 body is already stale.
      investigate: () => run((t) => api.investigate(t, incidentId)),
      approve: () => run((t) => api.approve(t, incidentId), applyIncident),
      reject: () => run((t) => api.reject(t, incidentId), applyIncident),
      reset: () => run((t) => api.reset(t), applyReset),
    }
  }, [mode, busy, cases, scenario, check, update, run, incidentId, applyIncident, applyReset])

  useEffect(() => {
    const pill = statusPill(data.incident)
    document.title = data.incident ? `${pill.label} · Patchlane` : 'Patchlane'
  }, [data.incident])

  return (
    <ClockContext.Provider value={clock}>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-ink px-3 py-2 text-canvas focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <div className="sticky top-0 z-40">
        <Header
          incident={data.incident}
          mode={mode}
          connection={live.connection}
          busy={busy}
          onOperator={() => setDialogOpen(true)}
          onExitOperator={() => {
            operatorToken.clear()
            setToken(null)
          }}
          onReset={() => operator?.reset()}
        />
        {mode === 'replay' && (
          <ReplayBanner
            replay={replay}
            gallery={gallery}
            notice={token && liveDown ? 'Live API unreachable.' : null}
            onRetryLive={token && liveDown ? () => setLiveDown(false) : null}
          />
        )}
      </div>

      <Dashboard data={data} mode={mode} replay={replay} operator={operator} benchmark={benchmark} gallery={gallery} />

      <Container as="footer">
        <div className="flex flex-col gap-2 border-t border-line pt-8 pb-10 text-[14px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2.5">
            <Logo className="size-5 text-ink" />
            <span className="font-bold text-ink">Patchlane</span>
            <span>HackHarvard 2026</span>
          </p>
          <p>Built with Daytona sandboxes, Factory Droid and Chalk evaluations.</p>
        </div>
      </Container>

      <OperatorDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={async (value) => {
          try {
            await api.checkToken(value)
          } catch (err) {
            const fail = (title, detail) => Object.assign(new Error(title), { detail })
            if (err instanceof ApiError && err.status === 401)
              throw fail('Incorrect operator token', 'The server rejected this token. Operator mode is still off and nothing was started.')
            if (err instanceof ApiError && err.status === 503)
              throw fail('Operator mode is turned off', 'The server has no operator token set, so no token can sign in.')
            throw fail('Could not reach the Patchlane API', 'The token was not checked. Try again in a moment.')
          }
          operatorToken.set(value)
          setToken(value)
          setLiveDown(false)
        }}
      />
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((list) => list.filter((t) => t.id !== id))} />
    </ClockContext.Provider>
  )
}
