import { KeyRound, LogOut, RotateCcw } from 'lucide-react'
import { phaseOf, statusPill } from '../utils/status'
import ThemeToggle from './ThemeToggle'
import { Container, Dot } from './ui'

export function Logo({ className = '' }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M11 8v16M21 8v16" style={{ stroke: 'var(--bg)' }} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M16 10v3M16 19v3" style={{ stroke: 'var(--bg)' }} strokeWidth="2.5" strokeLinecap="round" opacity=".55" />
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

// Anchors for the sections that exist in each phase.
function navFor(incident) {
  const phase = phaseOf(incident)
  if (phase === 'healthy') {
    return [
      ['How it works', '#how-it-works'],
      ['Benchmark', '#benchmark'],
    ]
  }
  if (phase === 'detected') {
    return [
      ['Incident', '#incident'],
      ['Benchmark', '#benchmark'],
    ]
  }
  if (phase === 'running') {
    return [
      ['Timeline', '#timeline'],
      ['Sandboxes', '#sandboxes'],
      ['Incident', '#incident'],
      ['Benchmark', '#benchmark'],
    ]
  }
  return [
    ['Results', '#results'],
    incident?.diff != null && ['Patch', '#patch'],
    ['Timeline', '#timeline'],
    ['Benchmark', '#benchmark'],
  ].filter(Boolean)
}

export default function Header({ incident, mode, connection, busy, onOperator, onExitOperator, onReset }) {
  const pill = statusPill(incident)
  const live = CONNECTION[connection] ?? CONNECTION.idle
  const nav = navFor(incident)

  return (
    <header className="border-b border-line bg-canvas/85 backdrop-blur-md">
      <Container className="flex h-16 items-center gap-4 xl:grid xl:grid-cols-[1fr_auto_1fr]">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <a href="./" className="flex shrink-0 items-center gap-2.5 rounded-md text-ink" aria-label="Patchlane home">
            <Logo className="size-7" />
            <span className="text-[18px] font-bold tracking-[-0.02em]">Patchlane</span>
          </a>
          <span aria-hidden="true" className="hidden h-5 w-px bg-line sm:block" />
          <p className="flex min-w-0 items-center gap-2 text-[14px] text-body" role="status">
            <Dot tone={pill.tone} live={pill.live} />
            <span className="truncate sm:hidden">{pill.short}</span>
            <span className="hidden truncate sm:inline">{pill.label}</span>
          </p>
        </div>

        <nav aria-label="Sections" className="hidden items-center gap-7 xl:flex">
          {nav.map(([label, href]) => (
            <a key={href} href={href} className="text-[15px] font-medium text-body transition-colors hover:text-ink">
              {label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 xl:justify-self-end">
          {mode === 'live' && (
            <>
              <span
                className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-medium whitespace-nowrap text-ink md:inline-flex"
                title="Operator mode"
              >
                <Dot tone={live.tone} live={connection === 'open'} />
                {live.label}
              </span>
              <button type="button" className="btn-quiet" onClick={onReset} disabled={busy} title="Reset the demo">
                <RotateCcw className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            </>
          )}
          <ThemeToggle />
          {mode === 'live' ? (
            <button
              type="button"
              className="icon-btn"
              onClick={onExitOperator}
              aria-label="Leave operator mode"
              title="Leave operator mode"
            >
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className="btn h-[38px] rounded-lg border border-line bg-surface px-2.5 text-[14px] text-ink hover:border-accent hover:text-accent sm:px-3.5"
              onClick={onOperator}
              aria-label="Operator sign-in"
            >
              <KeyRound className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Operator</span>
            </button>
          )}
        </div>
      </Container>
    </header>
  )
}
