import { ArrowDown, ArrowRight, Play, RotateCcw, Siren, TriangleAlert } from 'lucide-react'
import { clockTime, duration, money, plural, toMs } from '../utils/format'
import { heroCopy, phaseOf } from '../utils/status'
import { useNow } from '../state/clock'
import ApprovalStatus from './ApprovalStatus'
import LaneDiagram from './LaneDiagram'
import { Container, Dot, MetaList, Mono, Pill } from './ui'

const TITLE_TONE = {
  incident: 'text-incident',
  healthy: 'text-healthy',
  warning: 'text-ink',
}

// Big statements for the moments that need one (detection, resolution); a
// compact hero while work is happening, so the timeline and sandboxes stay in view.
const SIZE = {
  detected: 'lg',
  resolved: 'lg',
  running: 'md',
  review: 'md',
  failed: 'md',
}

export default function HeroStatus({ incident, mode, replay, operator }) {
  const phase = phaseOf(incident)

  if (phase === 'healthy') {
    return (
      <Container as="section" aria-labelledby="hero-title" className="pt-12 pb-16 sm:pt-20 sm:pb-24">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:items-center lg:gap-16">
          <Landing mode={mode} replay={replay} operator={operator} />
          <LaneDiagram />
        </div>
      </Container>
    )
  }

  const size = SIZE[phase] ?? 'md'
  const copy = heroCopy(incident)
  const sub = phase === 'detected' ? incident.symptom : phase === 'resolved' ? resolvedLine(incident) : copy.sub
  const failed = phase === 'failed'

  const title = (
    <h1
      id="hero-title"
      key={incident.status}
      className={`enter font-serif tracking-[-0.015em] text-balance ${TITLE_TONE[copy.tone] ?? 'text-ink'} ${
        size === 'lg'
          ? 'mt-5 max-w-[17ch] text-[46px] leading-[1.0] sm:text-[68px] lg:text-[84px]'
          : 'mt-3 text-[40px] leading-[1.02] sm:text-[52px] lg:text-[62px]'
      }`}
    >
      {copy.title}
    </h1>
  )

  const body = (
    <div className="min-w-0">
      {failed && incident.failureReason ? (
        <FailureReason reason={incident.failureReason} />
      ) : (
        sub && (
          <p className={`max-w-[44rem] leading-relaxed text-muted ${size === 'lg' ? 'mt-5 text-[18px] sm:text-[20px]' : 'mt-3 text-[17px] sm:text-[18px]'}`}>
            {sub}
          </p>
        )
      )}
      {size === 'lg' && phase !== 'detected' && <ImpactLine incident={incident} />}
      <div className={`empty:hidden ${size === 'lg' ? 'mt-8' : 'mt-5'}`}>
        <HeroAction incident={incident} phase={phase} mode={mode} replay={replay} operator={operator} />
      </div>
    </div>
  )

  if (size === 'lg') {
    return (
      <Container as="section" aria-labelledby="hero-title" className="pt-10 pb-10 sm:pt-14">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:items-end lg:gap-16">
          <div className="min-w-0">
            <HeroEyebrow incident={incident} phase={phase} />
            {title}
            {body}
          </div>
          <HeroFacts incident={incident} phase={phase} layout="rail" />
        </div>
      </Container>
    )
  }

  return (
    <Container as="section" aria-labelledby="hero-title" className="pt-7 pb-7 sm:pt-8">
      <HeroEyebrow incident={incident} phase={phase} />
      {title}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,35rem)] lg:items-start lg:gap-10">
        {body}
        <HeroFacts incident={incident} phase={phase} layout="row" />
      </div>
    </Container>
  )
}

function Landing({ mode, replay, operator }) {
  const live = mode === 'live'
  return (
    <div className="enter min-w-0">
      <p className="flex items-center gap-2 text-[15px] text-muted">
        <Dot tone="healthy" />
        {live ? 'Live · no open incidents' : 'Autonomous incident response for financial systems'}
      </p>
      <h1
        id="hero-title"
        className="mt-6 font-serif text-[52px] leading-[0.98] tracking-[-0.015em] text-balance text-ink sm:text-[76px] lg:text-[92px]"
      >
        {live ? (
          'All systems operational.'
        ) : (
          <>
            Your systems fail.
            <span className="block text-muted">Your agent shouldn’t make it worse.</span>
          </>
        )}
      </h1>
      <p className="mt-8 max-w-[40rem] text-[18px] leading-relaxed text-muted sm:text-[20px]">
        When a bug starts moving customers’ money, Patchlane reproduces the exploit in an isolated Daytona sandbox, lets
        Factory Droid patch it there, and proves the fix in a second, clean sandbox. A human approves before anything ships.
      </p>
      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
        {live ? (
          <button type="button" className="btn-primary" onClick={() => operator?.trigger()} disabled={operator?.busy}>
            <Siren className="size-5" aria-hidden="true" />
            Trigger demo incident
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            onClick={replay.play}
            disabled={replay.status === 'loading' || replay.status === 'error'}
          >
            <Play className="size-4" fill="currentColor" aria-hidden="true" />
            {replay.status === 'loading' ? 'Loading the recorded run…' : 'Play the recorded incident'}
          </button>
        )}
        <a href="#how-it-works" className="inline-flex items-center gap-2 text-[16px] font-medium text-ink underline-offset-4 hover:underline">
          How it works
          <ArrowDown className="size-4" aria-hidden="true" />
        </a>
      </div>
      {!live && replay.status === 'error' && (
        <p className="mt-4 text-[15px] text-incident">The recorded run could not be loaded: {replay.error}</p>
      )}
    </div>
  )
}

function FailureReason({ reason }) {
  return (
    <div className="mt-5 flex max-w-[46rem] gap-3 rounded-xl border border-line bg-white px-5 py-4" role="alert">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-incident" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-muted">Why it stopped</p>
        <p className="mt-0.5 text-[17px] leading-relaxed break-words text-ink">{reason}</p>
      </div>
    </div>
  )
}

function resolvedLine(incident) {
  return `${incident.id} is resolved. The verified patch is packaged and both sandboxes are destroyed.`
}

function HeroEyebrow({ incident, phase }) {
  const resolved = phase === 'resolved'
  return (
    <MetaList
      className="text-[15px] text-muted"
      gap="gap-y-2"
      items={[
        <span key="id" className="flex items-center gap-3">
          <Pill tone={resolved ? 'healthy' : 'incident'}>{resolved ? 'Resolved' : incident.severity}</Pill>
          <span className="font-mono text-[14px] text-ink">{incident.id}</span>
        </span>,
        <span key="svc">{incident.service}</span>,
        <Mono key="ep" className="text-ink">{incident.endpoint}</Mono>,
        <span key="at">Detected {clockTime(incident.createdAt)}</span>,
      ]}
    />
  )
}

function ImpactLine({ incident }) {
  const impact = incident.impact ?? {}
  if (!(impact.unauthorizedTransfers > 0)) return null
  const customers = impact.affectedCustomers?.length ?? 0
  return (
    <MetaList
      className="mt-4 text-[16px] text-muted"
      items={[
        <span key="n">
          <span className="num font-medium text-ink">{impact.unauthorizedTransfers}</span> unauthorized transfers
        </span>,
        <span key="m">
          <span className="num font-medium text-ink">{money(impact.amountMovedCents)}</span> moved
        </span>,
        <span key="c">{plural(customers, 'customer')} affected</span>,
      ]}
    />
  )
}

function HeroAction({ incident, phase, mode, replay, operator }) {
  const live = mode === 'live'

  if (phase === 'review' || incident.approval?.status === 'approved' || incident.approval?.status === 'rejected') {
    return (
      <div className="flex flex-col gap-6">
        <ApprovalStatus incident={incident} mode={mode} replay={replay} operator={operator} />
        {live && phase !== 'review' && <RunAgain operator={operator} />}
        {!live && replay.status === 'ended' && <WatchAgain replay={replay} />}
      </div>
    )
  }

  if (phase === 'detected') {
    if (live) {
      return (
        <button type="button" className="btn-primary" onClick={operator?.investigate} disabled={operator?.busy}>
          Investigate with Patchlane
          <ArrowRight className="size-5" aria-hidden="true" />
        </button>
      )
    }
    if (replay.checkpoint !== 'detected') return null
    return (
      <button type="button" className="btn-primary" onClick={replay.play}>
        Replay the investigation
        <ArrowRight className="size-5" aria-hidden="true" />
      </button>
    )
  }

  if (phase === 'running') {
    return null
  }

  // failed or resolved without an approval record
  if (live) return <RunAgain operator={operator} />
  if (replay.status === 'ended') return <WatchAgain replay={replay} />
  return null
}

function RunAgain({ operator }) {
  return (
    <div>
      <button type="button" className="btn-secondary" onClick={() => operator?.trigger()} disabled={operator?.busy}>
        <Siren className="size-5" aria-hidden="true" />
        Trigger a new incident
      </button>
    </div>
  )
}

function WatchAgain({ replay }) {
  return (
    <div>
      <button type="button" className="btn-secondary" onClick={replay.restart}>
        <RotateCcw className="size-4" aria-hidden="true" />
        Watch the replay again
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The facts rail on the right: the three numbers that matter in this phase.

function HeroFacts({ incident, phase, layout }) {
  const now = useNow()
  const facts = factsFor(incident, phase, now)
  if (!facts.length) return null
  const rail = layout === 'rail'
  return (
    <dl className={`grid grid-cols-3 ${rail ? 'gap-x-4 border-t border-line sm:gap-x-6 lg:grid-cols-1' : 'border-t border-line lg:border-t-0'}`}>
      {facts.map((f, i) => (
        <div
          key={f.label}
          className={`min-w-0 ${rail ? 'border-line pt-4 lg:border-b lg:py-5' : `pt-4 lg:pt-2 ${i ? 'border-l border-line pl-4 sm:pl-6' : 'lg:border-l lg:border-line lg:pl-6'}`}`}
        >
          <dt className={`text-[13px] leading-snug text-muted sm:text-[14px] ${rail ? '' : 'min-h-[2.6em] lg:min-h-0 lg:truncate'}`}>{f.label}</dt>
          <dd
            className={`num mt-1.5 leading-none font-semibold tracking-[-0.02em] ${
              rail ? 'text-[26px] sm:text-[36px]' : 'text-[24px] sm:text-[32px]'
            } ${f.tone ?? 'text-ink'}`}
          >
            {f.value}
          </dd>
          {f.note && <dd className="mt-1.5 text-[12.5px] leading-snug text-muted sm:text-[13px]">{f.note}</dd>}
        </div>
      ))}
    </dl>
  )
}

function factsFor(incident, phase, now) {
  const impact = incident.impact ?? {}
  const before = incident.before
  const after = incident.verification?.after
  const v = incident.verification
  const openFor = (toMs(incident.resolvedAt) ?? now) - toMs(incident.createdAt)

  if (phase === 'detected') {
    return [
      { label: 'Unauthorized transfers', value: impact.unauthorizedTransfers ?? '—', tone: 'text-incident' },
      { label: 'Moved out of accounts', value: money(impact.amountMovedCents) },
      { label: 'Customers affected', value: impact.affectedCustomers?.length ?? '—' },
    ]
  }

  if (phase === 'running') {
    const sb = incident.agentSandbox
    return [
      { label: 'Incident open', value: duration(openFor) },
      {
        label: 'Attacks that succeed',
        value: before?.replay ? `${before.replay.attacksSucceeded}/${before.replay.attacksTotal}` : '…',
        tone: before?.replay?.attacksSucceeded ? 'text-incident' : 'text-ink',
        note: before?.replay ? 'before any fix' : 'measuring in the sandbox',
      },
      { label: 'Sandbox commands', value: sb ? sb.commandsExecuted : '…', note: 'all in Daytona' },
    ]
  }

  if (phase === 'review') {
    return [
      {
        label: 'Attacks that succeed',
        value: after?.replay ? `${after.replay.attacksSucceeded}/${after.replay.attacksTotal}` : '—',
        tone: after?.replay && after.replay.attacksSucceeded === 0 ? 'text-healthy' : 'text-incident',
        note: before?.replay ? `was ${before.replay.attacksSucceeded}/${before.replay.attacksTotal} before` : undefined,
      },
      {
        label: 'Held-out tests',
        value: v ? `${v.hiddenPassed}/${v.hiddenTotal}` : '—',
        tone: v && v.hiddenTotal > 0 && v.hiddenPassed === v.hiddenTotal ? 'text-healthy' : 'text-ink',
        note: 'never shown to Droid',
      },
      {
        label: 'Legit transfers blocked',
        value: after?.replay ? `${after.replay.legitBlocked}/${after.replay.legitTotal}` : '—',
        tone: after?.replay && after.replay.legitBlocked === 0 ? 'text-healthy' : 'text-incident',
      },
    ]
  }

  if (phase === 'resolved') {
    const sandboxes = [incident.agentSandbox, incident.verificationSandbox].filter(Boolean)
    const destroyed = sandboxes.filter((s) => s.destroyedAt).length
    return [
      { label: 'Detection to resolution', value: duration(openFor) },
      { label: 'Transfers listed for reversal', value: impact.unauthorizedTransfers ?? '—' },
      { label: 'Sandboxes destroyed', value: sandboxes.length ? `${destroyed}/${sandboxes.length}` : '—' },
    ]
  }

  // failed / rejected
  const sandboxes = [incident.agentSandbox, incident.verificationSandbox].filter(Boolean)
  return [
    { label: 'Incident open', value: duration(openFor) },
    { label: 'Unauthorized transfers', value: impact.unauthorizedTransfers ?? '—', tone: 'text-incident' },
    {
      label: 'Sandboxes destroyed',
      value: sandboxes.length ? `${sandboxes.filter((s) => s.destroyedAt).length}/${sandboxes.length}` : '—',
    },
  ]
}
