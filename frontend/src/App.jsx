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
import { useBenchmark } from './state/useBenchmark'
import { useLive } from './state/useLive'
import { useReplay } from './state/useReplay'

// Replay can start at a given point: ?at=<status>|end|<seconds>, ?speed=4, ?play=1.
const params = new URLSearchParams(window.location.search)
const REPLAY_AT = params.get('at')
const REPLAY_SPEED = params.get('speed') === '4' ? 4 : 1
const REPLAY_AUTOPLAY = params.get('play') === '1'

// The operator's last chosen case, for this browser session only.
const CASE_KEY = 'patchlane.caseId'
const DEFAULT_CASE = 'ownership-check'

function savedCase() {
  try {
    return window.sessionStorage.getItem(CASE_KEY) || null
  } catch {
    return null
  }
}

function saveCase(id) {
  try {
    window.sessionStorage.setItem(CASE_KEY, id)
  } catch {
    /* storage unavailable: the choice lasts until the page reloads */
  }
}

export default function App() {
  const [token, setToken] = useState(() => operatorToken.get())
  const [liveDown, setLiveDown] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toasts, setToasts] = useState([])
  const [caseChoice, setCaseChoice] = useState(savedCase)
  const toastId = useRef(0)

  const mode = token && !liveDown ? 'live' : 'replay'

  const notify = useCallback((message, tone = 'warning') => {
    const id = ++toastId.current
    setToasts((list) => [...list.slice(-2), { id, message, tone }])
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 7000)
  }, [])

  const onUnreachable = useCallback(() => {
    setLiveDown(true)
    notify('The Patchlane API is unreachable. Showing the recorded run.')
  }, [notify])

  const live = useLive({ enabled: mode === 'live', onUnreachable })
  const replay = useReplay({
    enabled: mode === 'replay',
    initialAt: REPLAY_AT,
    initialSpeed: REPLAY_SPEED,
    autoplay: REPLAY_AUTOPLAY,
  })
  const benchmark = useBenchmark()

  // The case the next trigger runs: the saved choice if it still exists, else the default, else the first.
  const cases = benchmark.cases
  const caseId = useMemo(() => {
    if (!cases.length) return null
    if (cases.some((c) => c.id === caseChoice)) return caseChoice
    return (cases.find((c) => c.id === DEFAULT_CASE) ?? cases[0]).id
  }, [cases, caseChoice])
  const chooseCase = useCallback((id) => {
    setCaseChoice(id)
    saveCase(id)
  }, [])

  const data = mode === 'live' ? live.data : replay.data
  const liveNow = useTicker(mode === 'live', 1000)
  const now = mode === 'live' ? liveNow : (replay.now ?? liveNow)
  const clock = useCallback(() => now, [now])

  // Operator actions: POSTs with the bearer token. Never used while replaying.
  const run = useCallback(
    async (call, onDone) => {
      if (!token) return
      setBusy(true)
      try {
        const result = await call(token)
        onDone?.(result)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          operatorToken.clear()
          setToken(null)
          notify('The operator token was rejected. Showing the recorded run.', 'incident')
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
    return {
      busy,
      cases,
      caseId,
      chooseCase,
      trigger: () => run((t) => api.trigger(t, caseId ?? undefined), applyIncident),
      // The SSE stream carries the investigation; the 202 body is already stale.
      investigate: () => run((t) => api.investigate(t, incidentId)),
      approve: () => run((t) => api.approve(t, incidentId), applyIncident),
      reject: () => run((t) => api.reject(t, incidentId), applyIncident),
      reset: () => run((t) => api.reset(t), applyReset),
    }
  }, [mode, busy, cases, caseId, chooseCase, run, incidentId, applyIncident, applyReset])

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
            notice={token && liveDown ? 'Live API unreachable.' : null}
            onRetryLive={token && liveDown ? () => setLiveDown(false) : null}
          />
        )}
      </div>

      <Dashboard data={data} mode={mode} replay={replay} operator={operator} benchmark={benchmark} />

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
        onSubmit={(value) => {
          operatorToken.set(value)
          setToken(value)
          setLiveDown(false)
        }}
      />
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((list) => list.filter((t) => t.id !== id))} />
    </ClockContext.Provider>
  )
}
