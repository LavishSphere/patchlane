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

export default function App() {
  const [token, setToken] = useState(() => operatorToken.get())
  const [liveDown, setLiveDown] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toasts, setToasts] = useState([])
  const toastId = useRef(0)

  const mode = token && !liveDown ? 'live' : 'replay'

  const notify = useCallback((message, tone = 'warning') => {
    const id = ++toastId.current
    setToasts((list) => [...list.slice(-2), { id, message, tone }])
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 7000)
  }, [])

  const onUnreachable = useCallback(() => {
    setLiveDown(true)
    notify('The Patchlane API is unreachable, so this shows the recorded run instead.')
  }, [notify])

  const live = useLive({ enabled: mode === 'live', onUnreachable })
  const replay = useReplay({
    enabled: mode === 'replay',
    initialAt: REPLAY_AT,
    initialSpeed: REPLAY_SPEED,
    autoplay: REPLAY_AUTOPLAY,
  })
  const benchmark = useBenchmark()

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
      trigger: () => run((t) => api.trigger(t), applyIncident),
      // The SSE stream carries the investigation; the 202 body is already stale.
      investigate: () => run((t) => api.investigate(t, incidentId)),
      approve: () => run((t) => api.approve(t, incidentId), applyIncident),
      reject: () => run((t) => api.reject(t, incidentId), applyIncident),
      reset: () => run((t) => api.reset(t), applyReset),
    }
  }, [mode, busy, run, incidentId, applyIncident, applyReset])

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

      <footer className="border-t border-line">
        <Container className="flex flex-col gap-3 py-10 text-[14px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2.5">
            <Logo className="size-5 text-ink" />
            <span className="font-medium text-ink">Patchlane</span>
            <span>Reproduce. Patch. Verify. Recover.</span>
          </p>
          <p>AI agents can move fast without being trusted with production.</p>
        </Container>
      </footer>

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
