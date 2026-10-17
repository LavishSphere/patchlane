import { Check, X } from 'lucide-react'
import { STAGES, stageOf } from '../utils/status'
import { Container } from './ui'

function stepState(i, { index, outcome }) {
  if (outcome === 'done') return 'done'
  if (i < index) return 'done'
  if (i > index) return 'pending'
  if (outcome === 'failed') return 'failed'
  if (outcome === 'rejected') return 'rejected'
  return 'active'
}

function Marker({ state, last, resolved }) {
  if (state === 'done') {
    return (
      <span className={`grid size-6 place-items-center rounded-full text-white ${resolved ? 'bg-healthy' : 'bg-ink'}`}>
        <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
      </span>
    )
  }
  if (state === 'active') {
    return (
      <span className="grid size-6 place-items-center rounded-full border-2 border-ink bg-white">
        <span className={`size-2 rounded-full bg-ink ${last ? '' : 'pulse-dot'}`} />
      </span>
    )
  }
  if (state === 'failed' || state === 'rejected') {
    return (
      <span className={`grid size-6 place-items-center rounded-full text-white ${state === 'failed' ? 'bg-incident' : 'bg-warning'}`}>
        <X className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
      </span>
    )
  }
  return <span className="block size-6 rounded-full border border-[#d6d1c7] bg-white" />
}

const STATE_LABEL = {
  done: 'done',
  active: 'in progress',
  pending: 'not started',
  failed: 'failed',
  rejected: 'rejected',
}

export default function StageStepper({ incident }) {
  const progress = stageOf(incident)
  if (progress.index < 0) return null
  const resolved = progress.outcome === 'done'
  const current = STAGES[Math.min(progress.index, STAGES.length - 1)]
  const currentState = stepState(progress.index, progress)

  return (
    <Container as="nav" aria-label="Incident progress" className="pb-2">
      {/* Desktop: the full lane */}
      <ol className="hidden grid-cols-8 border-y border-line py-4 md:grid">
        {STAGES.map((stage, i) => {
          const state = stepState(i, progress)
          const lineDone = i < progress.index || resolved
          return (
            <li key={stage.key} className="relative min-w-0" aria-current={state === 'active' ? 'step' : undefined}>
              <div className="flex items-center">
                <Marker state={state} last={i === STAGES.length - 1} resolved={resolved} />
                {i < STAGES.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`mx-2 h-px flex-1 transition-colors duration-200 ${lineDone ? (resolved ? 'bg-healthy' : 'bg-ink') : 'bg-line'}`}
                  />
                )}
              </div>
              <p
                className={`mt-2.5 truncate text-[15px] leading-tight font-medium ${
                  state === 'pending' ? 'text-faint' : state === 'failed' ? 'text-incident' : 'text-ink'
                }`}
              >
                {stage.label}
                <span className="sr-only">: {STATE_LABEL[state]}</span>
              </p>
              <p className={`mt-0.5 truncate text-[13px] ${state === 'pending' ? 'text-faint' : 'text-muted'}`}>{stage.actor}</p>
            </li>
          )
        })}
      </ol>

      {/* Phone: one line and a segmented bar */}
      <div className="border-y border-line py-4 md:hidden">
        <p className="flex items-baseline justify-between gap-3 text-[15px]">
          <span className="font-medium text-ink">
            {resolved ? 'All steps complete' : `${current.label} · ${current.actor}`}
            {(currentState === 'failed' || currentState === 'rejected') && (
              <span className={currentState === 'failed' ? 'text-incident' : 'text-warning'}> · {STATE_LABEL[currentState]}</span>
            )}
          </span>
          <span className="num shrink-0 text-[13px] text-muted">
            Step {Math.min(progress.index + 1, STAGES.length)} of {STAGES.length}
          </span>
        </p>
        <div className="mt-3 grid grid-cols-8 gap-1" aria-hidden="true">
          {STAGES.map((stage, i) => {
            const state = stepState(i, progress)
            const color =
              state === 'done'
                ? resolved
                  ? 'bg-healthy'
                  : 'bg-ink'
                : state === 'active'
                  ? 'bg-ink/45'
                  : state === 'failed'
                    ? 'bg-incident'
                    : state === 'rejected'
                      ? 'bg-warning'
                      : 'bg-line'
            return <span key={stage.key} className={`h-1.5 rounded-full ${color}`} />
          })}
        </div>
      </div>
    </Container>
  )
}
