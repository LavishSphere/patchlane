import { ArrowDown, ArrowRight, Play, RotateCcw, Siren, TriangleAlert } from 'lucide-react'
import { clockTime, dateTime, duration, money, seconds, toMs } from '../utils/format'
import { heroCopy, phaseOf } from '../utils/status'
import { useNow } from '../state/clock'
import ApprovalStatus from './ApprovalStatus'
import { Container, Dot, MetaList, Mono, Pill, StatStrip } from './ui'

const TITLE_TONE = {
  incident: 'text-incident',
  healthy: 'text-healthy',
  warning: 'text-ink',
}

export default function HeroStatus({ incident, mode, replay, operator, benchmark }) {
  const phase = phaseOf(incident)

  if (phase === 'healthy') {
    return <Landing mode={mode} replay={replay} operator={operator} benchmark={benchmark} />
  }

  const copy = heroCopy(incident)
  const title = phase === 'detected' ? (incident.title ?? copy.title) : copy.title
  const sub = phase === 'detected' ? incident.symptom : phase === 'resolved' ? resolvedLine(incident) : copy.sub
  const failed = phase === 'failed'

  return (
    <Container as="section" aria-labelledby="hero-title" className="pt-8 pb-8 sm:pt-10 sm:pb-9">
      <HeroMeta incident={incident} phase={phase} />
      <h1
        id="hero-title"
        key={incident.status}
        className={`enter mt-4 font-serif text-[40px] leading-[1.02] tracking-[-0.015em] text-balance sm:text-[54px] lg:text-[60px] ${
          TITLE_TONE[copy.tone] ?? 'text-ink'
        }`}
      >
        {title}
      </h1>
      <div className="mt-5 grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)] lg:items-start lg:gap-12">
        <div className="min-w-0">
          {failed && incident.failureReason ? (
            <FailureReason reason={incident.failureReason} />
          ) : (
            sub && <p className="max-w-[40rem] text-[17px] leading-relaxed text-body sm:text-[18px]">{sub}</p>
          )}
          <div className="mt-6 empty:hidden">
            <HeroAction incident={incident} phase={phase} mode={mode} replay={replay} operator={operator} />
          </div>
        </div>
        <HeroFacts incident={incident} phase={phase} />
      </div>
    </Container>
  )
}

function Landing({ mode, replay, operator, benchmark }) {
  const live = mode === 'live'
  return (
    <Container as="section" aria-labelledby="hero-title" className="pt-14 pb-14 sm:pt-24 sm:pb-20">
      <div className="enter max-w-[44rem]">
        {live && (
          <p className="mb-5 flex items-center gap-2 text-[15px] text-body">
            <Dot tone="healthy" />
            Live. No open incidents.
          </p>
        )}
        <h1 id="hero-title" className="font-serif text-[72px] leading-[0.95] tracking-[-0.02em] text-ink sm:text-[104px] lg:text-[120px]">
          Patchlane
        </h1>
        <p className="mt-7 text-[18px] leading-relaxed text-body sm:text-[19px]">
          Patchlane is an incident responder for payment systems. When a fraud rule flags bad transfers, it copies the service
          into a Daytona sandbox with no network, reproduces the exploit, and has Factory Droid write a patch there. A second,
          clean sandbox tests the patch, and an operator approves or rejects it.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
          {live ? (
            <button type="button" className="btn-primary" onClick={() => operator?.trigger()} disabled={operator?.busy}>
              <Siren className="size-[18px]" aria-hidden="true" />
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
              {replay.status === 'loading' ? 'Loading the recording…' : 'Play the recorded incident'}
            </button>
          )}
          <a href="#how-it-works" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-accent hover:underline">
            How it works
            <ArrowDown className="size-4" aria-hidden="true" />
          </a>
        </div>
        {!live && replay.status === 'error' && (
          <p className="mt-4 text-[15px] text-incident">The recording didn’t load: {replay.error}</p>
        )}
      </div>
      <BenchmarkStrip benchmark={benchmark} />
    </Container>
  )
}

/** The latest benchmark in four numbers. Hidden until real results load. */
function BenchmarkStrip({ benchmark }) {
  const data = benchmark?.data
  if (benchmark?.status !== 'ready' || !data?.available) return null
  const num = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : null)
  const summary = data.summary ?? {}
  const rows = Array.isArray(data.rows) ? data.rows : []
  const runs = num(summary.runs) ?? rows.length
  const verified = num(summary.verified) ?? rows.filter((r) => r.verdict === 'safe_to_review').length
  const composite = data.chalk?.available ? num(data.chalk.aggregate?.meanComposite) : null
  const median = num(summary.medianDurationS)
  const bugs = Array.isArray(data.cases) ? data.cases.length : null

  return (
    <div className="enter mt-14 sm:mt-20">
      <StatStrip
        items={[
          runs > 0 && { label: 'Runs verified by Patchlane', value: `${verified}/${runs}` },
          composite != null && { label: 'Mean Chalk score, out of 1', value: composite.toFixed(2) },
          bugs != null && { label: 'Seeded bug types', value: bugs },
          median != null && { label: 'Median time per run', value: seconds(median) },
        ]}
      />
      <p className="mt-3 text-[14px] text-muted">
        {data.generatedAt ? `From the benchmark run on ${dateTime(data.generatedAt)}. ` : 'From the latest benchmark. '}
        <a href="#benchmark" className="link">
          See every run
        </a>
      </p>
    </div>
  )
}

function FailureReason({ reason }) {
  return (
    <div className="flex max-w-[44rem] gap-3 rounded-xl border border-incident/30 bg-incident-soft px-5 py-4" role="alert">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-incident" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-incident">Reason</p>
        <p className="mt-0.5 text-[17px] leading-relaxed break-words text-ink">{reason}</p>
      </div>
    </div>
  )
}

function resolvedLine(incident) {
  const n = incident.impact?.unauthorizedTransfers
  return n > 0
    ? `The patch is packaged, both sandboxes are destroyed, and the ${n} unauthorized transfers are listed for reversal.`
    : 'The patch is packaged and both sandboxes are destroyed.'
}

function HeroMeta({ incident, phase }) {
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
        <Mono key="ep" className="text-ink">
          {incident.endpoint}
        </Mono>,
        <span key="at">Detected {clockTime(incident.createdAt)}</span>,
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
          Investigate
          <ArrowRight className="size-[18px]" aria-hidden="true" />
        </button>
      )
    }
    if (replay.checkpoint !== 'detected') return null
    return (
      <div className="flex flex-col gap-3">
        <div>
          <button type="button" className="btn-primary" onClick={replay.play}>
            Replay the investigation
            <ArrowRight className="size-[18px]" aria-hidden="true" />
          </button>
        </div>
        <p className="text-[14px] text-muted">The recording is paused where the operator started the investigation.</p>
      </div>
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
        <Siren className="size-[18px]" aria-hidden="true" />
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
// The three numbers that matter in this phase.

function HeroFacts({ incident, phase }) {
  const now = useNow()
  const facts = factsFor(incident, phase, now)
  if (!facts.length) return null
  return <StatStrip items={facts} />
}

function factsFor(incident, phase, now) {
  const impact = incident.impact ?? {}
  const before = incident.before
  const after = incident.verification?.after
  const v = incident.verification
  const openFor = (toMs(incident.resolvedAt) ?? now) - toMs(incident.createdAt)
  const sandboxes = [incident.agentSandbox, incident.verificationSandbox].filter(Boolean)
  const destroyed = sandboxes.filter((s) => s.destroyedAt).length

  if (phase === 'detected') {
    return [
      { label: 'Unauthorized transfers', value: impact.unauthorizedTransfers ?? '–', tone: 'text-incident' },
      { label: 'Moved out of accounts', value: money(impact.amountMovedCents) },
      { label: 'Customers affected', value: impact.affectedCustomers?.length ?? '–' },
    ]
  }

  if (phase === 'running') {
    const sb = incident.agentSandbox
    return [
      { label: 'Time open', value: duration(openFor) },
      {
        label: 'Attacks that succeed',
        value: before?.replay ? `${before.replay.attacksSucceeded}/${before.replay.attacksTotal}` : '…',
        tone: before?.replay?.attacksSucceeded ? 'text-incident' : 'text-ink',
        note: before?.replay ? 'before any fix' : 'measuring now',
      },
      { label: 'Sandbox commands', value: sb ? sb.commandsExecuted : '…', note: 'all in Daytona' },
    ]
  }

  if (phase === 'review') {
    return [
      {
        label: 'Attacks that succeed',
        value: after?.replay ? `${after.replay.attacksSucceeded}/${after.replay.attacksTotal}` : '–',
        tone: after?.replay && after.replay.attacksSucceeded === 0 ? 'text-healthy' : 'text-incident',
        note: before?.replay ? `${before.replay.attacksSucceeded}/${before.replay.attacksTotal} before the patch` : undefined,
      },
      {
        label: 'Held-out tests',
        value: v ? `${v.hiddenPassed}/${v.hiddenTotal}` : '–',
        tone: v && v.hiddenTotal > 0 && v.hiddenPassed === v.hiddenTotal ? 'text-healthy' : 'text-ink',
        note: 'Droid never saw these',
      },
      {
        label: 'Legit transfers blocked',
        value: after?.replay ? `${after.replay.legitBlocked}/${after.replay.legitTotal}` : '–',
        tone: after?.replay && after.replay.legitBlocked === 0 ? 'text-healthy' : 'text-incident',
      },
    ]
  }

  if (phase === 'resolved') {
    return [
      { label: 'Detection to resolution', value: duration(openFor) },
      { label: 'Transfers listed for reversal', value: impact.unauthorizedTransfers ?? '–' },
      { label: 'Sandboxes destroyed', value: sandboxes.length ? `${destroyed}/${sandboxes.length}` : '–' },
    ]
  }

  // failed / rejected
  return [
    { label: 'Time open', value: duration(openFor) },
    { label: 'Unauthorized transfers', value: impact.unauthorizedTransfers ?? '–', tone: 'text-incident' },
    { label: 'Sandboxes destroyed', value: sandboxes.length ? `${destroyed}/${sandboxes.length}` : '–' },
  ]
}
