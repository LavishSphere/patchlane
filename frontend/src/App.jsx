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
import { useRecordings } from './state/useRecordings'
import { useReplay } from './state/useReplay'

// Replay can start at a given point: ?at=<status>|end|<seconds>, ?speed=4, ?play=1.
// ?recording=<name> picks a recording listed in public/recordings/index.json.
const params = new URLSearchParams(window.location.search)
const REPLAY_AT = params.get('at')
const REPLAY_SPEED = params.get('speed') === '4' ? 4 : 1
const REPLAY_AUTOPLAY = params.get('play') === '1'
const REPLAY_RECORDING = params.get('recording')
const GOLDEN = 'golden'

// The operator's last built incident ({ caseId, variantId }), for this browser session only.
const CHOICE_KEY = 'patchlane.incidentChoice'
const OLD_CASE_KEY = 'patchlane.caseId'
const DEFAULT_CASE = 'ownership-check'

function savedChoice() {
  try {
    const raw = window.sessionStorage.getItem(CHOICE_KEY)
    if (raw) {
      const value = JSON.parse(raw)
      return {
        caseId: typeof value?.caseId === 'string' ? value.caseId : null,
        variantId: typeof value?.variantId === 'string' ? value.variantId : null,
      }
    }
    return { caseId: window.sessionStorage.getItem(OLD_CASE_KEY) || null, variantId: null }
  } catch {
    return { caseId: null, variantId: null }
  }
}

function saveChoice(choice) {
  try {
    window.sessionStorage.setItem(CHOICE_KEY, JSON.stringify(choice))
  } catch {
    /* storage unavailable: the choice lasts until the page reloads */
  }
}

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
  const [choice, setChoice] = useState(savedChoice)
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

  // The incident the next trigger runs: the saved case and variant if they still exist,
  // else the default case, else the first. A case without the saved variant uses its first.
  const cases = benchmark.cases
  const { caseId, variantId } = useMemo(() => {
    if (!cases.length) return { caseId: null, variantId: null }
    const found = cases.find((c) => c.id === choice.caseId)
    const chosen = found ?? cases.find((c) => c.id === DEFAULT_CASE) ?? cases[0]
    const variants = Array.isArray(chosen.variants) ? chosen.variants : []
    const variant = (found && variants.find((v) => v.id === choice.variantId)) || variants[0] || null
    return { caseId: chosen.id, variantId: variant?.id ?? null }
  }, [cases, choice])
  const chooseCase = useCallback((id) => {
    // A new safeguard starts from its default break.
    const next = { caseId: id, variantId: null }
    setChoice(next)
    saveChoice(next)
  }, [])
  const chooseVariant = useCallback(
    (id) => {
      const next = { caseId, variantId: id }
      setChoice(next)
      saveChoice(next)
    },
    [caseId],
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
      variantId,
      chooseCase,
      chooseVariant,
      trigger: () => run((t) => api.trigger(t, caseId, variantId), applyIncident),
      // The SSE stream carries the investigation; the 202 body is already stale.
      investigate: () => run((t) => api.investigate(t, incidentId)),
      approve: () => run((t) => api.approve(t, incidentId), applyIncident),
      reject: () => run((t) => api.reject(t, incidentId), applyIncident),
      reset: () => run((t) => api.reset(t), applyReset),
    }
  }, [mode, busy, cases, caseId, variantId, chooseCase, chooseVariant, run, incidentId, applyIncident, applyReset])

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
