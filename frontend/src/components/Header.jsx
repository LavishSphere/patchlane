import { KeyRound, LockKeyhole, RotateCcw } from 'lucide-react'
import { statusPill } from '../utils/status'
import { Container, Dot } from './ui'

export function Logo({ className = '' }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M11 8v16M21 8v16" stroke="#f7f5f0" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M16 10v3M16 19v3" stroke="#f7f5f0" strokeWidth="2.5" strokeLinecap="round" opacity=".55" />
    </svg>
  )
}

const CONNECTION = {
  open: { label: 'Live', tone: 'healthy' },
  polling: { label: 'Live', tone: 'healthy' },
  connecting: { label: 'Connecting…', tone: 'warning' },
  unreachable: { label: 'Reconnecting…', tone: 'incident' },
  idle: { label: 'Live', tone: 'muted' },
}

export default function Header({ incident, mode, connection, busy, onOperator, onExitOperator, onReset }) {
  const pill = statusPill(incident)
  const live = CONNECTION[connection] ?? CONNECTION.idle

  return (
    <header className="border-b border-line bg-canvas/90 backdrop-blur supports-[backdrop-filter]:bg-canvas/80">
      <Container className="flex h-16 items-center gap-3 sm:gap-5">
        <a href="./" className="flex shrink-0 items-center gap-2.5 rounded-md text-ink" aria-label="Patchlane home">
          <Logo className="size-7" />
          <span className="text-[19px] font-semibold tracking-[-0.02em]">Patchlane</span>
        </a>

        <span aria-hidden="true" className="hidden h-5 w-px bg-line sm:block" />

        <p className="flex min-w-0 items-center gap-2 text-[15px] text-ink" role="status">
          <Dot tone={pill.tone} live={pill.live} />
          <span className="truncate sm:hidden">{pill.short}</span>
          <span className="hidden truncate sm:inline">{pill.label}</span>
        </p>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          {mode === 'live' ? (
            <>
              <span className="hidden items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-[13px] font-medium text-ink md:inline-flex">
                <Dot tone={live.tone} live={connection === 'open'} />
                Operator · {live.label}
              </span>
              <button type="button" className="btn-quiet" onClick={onReset} disabled={busy} title="Reset the demo">
                <RotateCcw className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Reset</span>
              </button>
              <button
                type="button"
                className="btn-quiet"
                onClick={onExitOperator}
                aria-label="Leave operator mode"
                title="Leave operator mode"
              >
                <LockKeyhole className="size-4" aria-hidden="true" />
              </button>
            </>
          ) : (
            <button type="button" className="btn-quiet" onClick={onOperator} aria-label="Operator sign-in">
              <KeyRound className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Operator</span>
            </button>
          )}
        </div>
      </Container>
    </header>
  )
}
