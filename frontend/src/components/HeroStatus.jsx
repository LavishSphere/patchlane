import { ArrowDown, ArrowRight, ChevronDown, ChevronUp, ListVideo, Play, RotateCcw, Siren, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { clockTime, dateTime, duration, money, seconds, toMs } from '../utils/format'
import { bugsOf, endpointsOf, hasImpact, hasReplay, heroCopy, manyBugsTitle, phaseOf } from '../utils/status'
import { useNow } from '../state/clock'
import ApprovalStatus from './ApprovalStatus'
import IncidentBuilder, { ScenarioStatus } from './IncidentBuilder'
import { Container, Dot, MetaList, Mono, Pill, StatStrip } from './ui'

const TITLE_TONE = {
  incident: 'text-incident',
  healthy: 'text-healthy',
  warning: 'text-ink',
}

export default function HeroStatus({ incident, mode, replay, operator, benchmark, gallery }) {
  const phase = phaseOf(incident)

  if (phase === 'healthy') {
    return <Landing mode={mode} replay={replay} operator={operator} benchmark={benchmark} gallery={gallery} />
  }

  const copy = heroCopy(incident)
  const bugs = bugsOf(incident)
  const many = bugs.length > 1
  const title = phase === 'detected' ? (many ? manyBugsTitle(bugs.length) : (incident.title ?? copy.title)) : copy.title
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
      {many && <BugList bugs={bugs} />}
      <div className="mt-5 grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)] lg:items-start lg:gap-12">
        <div className="min-w-0">
          {failed && incident.failureReason ? (
            <FailureReason reason={incident.failureReason} />
          ) : (
            sub && <p className="max-w-[40rem] text-[17px] leading-relaxed text-body sm:text-[18px]">{sub}</p>
          )}
          <div className="mt-6 empty:hidden">
            <HeroAction
              incident={incident}
              phase={phase}
              mode={mode}
              replay={replay}
              operator={operator}
              gallery={gallery}
              benchmark={benchmark}
            />
          </div>
        </div>
        <HeroFacts incident={incident} phase={phase} />
      </div>
    </Container>
  )
}

function Landing({ mode, replay, operator, benchmark, gallery }) {
  const live = mode === 'live'
  const picker = live && operator?.cases?.length > 0
  const howItWorks = (
    <a href="#how-it-works" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-accent hover:underline">
      How it works
      <ArrowDown className="size-4" aria-hidden="true" />
    </a>
  )
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
        {!picker && (
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
            {howItWorks}
          </div>
        )}
        {!live && gallery && <SelectedRecording gallery={gallery} />}
        {!live && replay.status === 'error' && (
          <p className="mt-4 text-[15px] text-incident">The recording didn’t load: {replay.error}</p>
        )}
      </div>
      {picker && (
        <div className="enter mt-10">
          <IncidentBuilder
            operator={operator}
            benchmark={benchmark}
            action={
              <button type="button" className="btn-primary" onClick={() => operator.trigger()} disabled={operator.busy || !operator.ready}>
                <Siren className="size-[18px]" aria-hidden="true" />
                Trigger demo incident
              </button>
            }
          />
          <div className="mt-8">{howItWorks}</div>
        </div>
      )}
      <BenchmarkStrip benchmark={benchmark} />
    </Container>
  )
}

/** Which recorded run the Play button starts, with a link to the full list. */
function SelectedRecording({ gallery }) {
  const entry = gallery.list.find((r) => r.name === gallery.selected)
  if (!entry) return null
  const facts = [entry.severity, typeof entry.durationS === 'number' ? `run time ${duration(entry.durationS * 1000)}` : null].filter(
    Boolean,
  )
  return (
    <p className="mt-5 text-[15px] leading-relaxed text-muted">
      Selected run: <span className="text-ink">{entry.title || entry.name}</span>
      {facts.length > 0 && <span> ({facts.join(', ')})</span>}.{' '}
      <a href="#recordings" className="link whitespace-nowrap">
        Choose from {gallery.list.length} recorded runs
      </a>
    </p>
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

/** Every bug of a compound incident, named under the headline in every phase. */
function BugList({ bugs }) {
  return (
    <ol aria-label="Bugs in this incident" className="mt-5 max-w-[46rem] border-t border-line">
      {bugs.map((bug, i) => (
        <li key={bug.caseId ?? i} className="flex items-baseline gap-4 border-b border-line py-2">
          <span className="num shrink-0 text-[14px] text-muted">Bug {i + 1}</span>
          <span className="min-w-0 text-[17px] leading-snug text-ink sm:text-[18px]">{bug.title}</span>
        </li>
      ))}
    </ol>
  )
}

function HeroMeta({ incident, phase }) {
  const resolved = phase === 'resolved'
  // Several bugs at once list each endpoint once.
  const endpoints = endpointsOf(incident)
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
        ...endpoints.map((ep) => (
          <Mono key={`ep-${ep}`} className="text-ink">
            {ep}
          </Mono>
        )),
        <span key="at">Detected {clockTime(incident.createdAt)}</span>,
      ]}
    />
  )
}

function HeroAction({ incident, phase, mode, replay, operator, gallery, benchmark }) {
  const live = mode === 'live'

  if (phase === 'review' || incident.approval?.status === 'approved' || incident.approval?.status === 'rejected') {
    return (
      <div className="flex flex-col gap-6">
        <ApprovalStatus incident={incident} mode={mode} replay={replay} operator={operator} />
        {live && phase !== 'review' && <RunAgain operator={operator} benchmark={benchmark} />}
        {!live && replay.status === 'ended' && <WatchAgain replay={replay} gallery={gallery} />}
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
  if (live) return <RunAgain operator={operator} benchmark={benchmark} />
  if (replay.status === 'ended') return <WatchAgain replay={replay} gallery={gallery} />
  return null
}

/**
 * After an incident: the next scenario in one summary line with the trigger.
 * "Change scenario" opens the full builder in place.
 */
function RunAgain({ operator, benchmark }) {
  const [open, setOpen] = useState(false)
  const button = (
    <button type="button" className="btn-secondary" onClick={() => operator?.trigger()} disabled={operator?.busy || operator?.ready === false}>
      <Siren className="size-[18px]" aria-hidden="true" />
      Trigger a new incident
    </button>
  )
  if (!operator?.cases?.length) return <div>{button}</div>

  const toggle = (
    <button type="button" className="btn-quiet h-11 px-4" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
      {open ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
      {open ? 'Hide the list' : 'Change scenario'}
    </button>
  )
  const actions = (
    <div className="flex flex-wrap items-center gap-3">
      {button}
      {toggle}
    </div>
  )
  if (open) return <IncidentBuilder operator={operator} benchmark={benchmark} action={actions} />

  const names = operator.scenario
    .map((b) => operator.cases.find((c) => c.id === b.caseId))
    .filter(Boolean)
    .map((c) => c.safeguard || c.title)
  const n = names.length
  return (
    <div className="max-w-[40rem]">
      <p className="text-[16px] leading-snug text-ink">
        <span className="font-semibold">Next scenario:</span> {n === 0 ? 'no safeguards ticked' : n === 1 ? '1 bug' : `${n} bugs`}
      </p>
      {n > 0 && (
        <MetaList
          className="mt-1 text-[15px] leading-snug text-body"
          items={names.map((name) => (
            <span key={name}>{name}</span>
          ))}
        />
      )}
      <div className="mt-3">
        <ScenarioStatus check={operator.check} />
      </div>
      <div className="mt-4">{actions}</div>
    </div>
  )
}

function WatchAgain({ replay, gallery }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <button type="button" className="btn-secondary" onClick={replay.restart}>
        <RotateCcw className="size-4" aria-hidden="true" />
        Watch the replay again
      </button>
      {gallery && (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-accent hover:underline"
          onClick={() => {
            // Back to the start of this run, where the full list is shown.
            replay.restart()
            requestAnimationFrame(() => document.getElementById('recordings')?.scrollIntoView({ behavior: 'smooth' }))
          }}
        >
          <ListVideo className="size-4" aria-hidden="true" />
          Watch another recorded run
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The three numbers that matter in this phase.

function HeroFacts({ incident, phase }) {
  const now = useNow()
  if (phase === 'detected' && !hasImpact(incident)) return <AlertFacts incident={incident} />
  const facts = factsFor(incident, phase, now).filter(Boolean)
  if (!facts.length) return null
  const cols = facts.length === 2 ? 'grid-cols-2' : facts.length === 4 ? 'grid-cols-2 md:grid-cols-4 lg:grid-cols-2' : undefined
  return <StatStrip items={facts} cols={cols} />
}

/** Detection without transfer numbers: the alert itself is the fact to show. */
function AlertFacts({ incident }) {
  if (!incident.alert) return null
  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4">
      <p className="text-[14px] text-muted">Alert</p>
      <p className="mt-1.5 text-[17px] leading-relaxed text-ink">{incident.alert}</p>
    </div>
  )
}

const passFail = (passed) => (passed ? 'Pass' : 'Fail')
// Several bugs at once have one incident test each, and reproPassed covers all of them.
const exploitLabel = (incident) => (bugsOf(incident).length > 1 ? 'Exploit tests' : 'Exploit test')

function factsFor(incident, phase, now) {
  const impact = incident.impact ?? {}
  const before = incident.before
  const after = incident.verification?.after
  const v = incident.verification
  const openFor = (toMs(incident.resolvedAt) ?? now) - toMs(incident.createdAt)
  const sandboxes = [incident.agentSandbox, incident.verificationSandbox].filter(Boolean)
  const destroyed = sandboxes.filter((s) => s.destroyedAt).length
  const replayed = hasReplay(incident)
  const hidden = {
    label: 'Held-out tests',
    value: v ? `${v.hiddenPassed}/${v.hiddenTotal}` : '-',
    tone: v && v.hiddenTotal > 0 && v.hiddenPassed === v.hiddenTotal ? 'text-healthy' : 'text-ink',
    note: 'Droid never saw these',
  }

  if (phase === 'detected') {
    return [
      { label: 'Unauthorized transfers', value: impact.unauthorizedTransfers ?? '-', tone: 'text-incident' },
      { label: 'Moved out of accounts', value: money(impact.amountMovedCents) },
      { label: 'Customers affected', value: impact.affectedCustomers?.length ?? '-' },
    ]
  }

  if (phase === 'running') {
    const sb = incident.agentSandbox
    const commands = { label: 'Sandbox commands', value: sb ? sb.commandsExecuted : '…', note: 'all in Daytona' }
    // Once the before measurements exist, they say whether there was a replay.
    if (before ? before.replay : replayed) {
      return [
        { label: 'Time open', value: duration(openFor) },
        {
          label: 'Attacks that succeed',
          value: before?.replay ? `${before.replay.attacksSucceeded}/${before.replay.attacksTotal}` : '…',
          tone: before?.replay?.attacksSucceeded ? 'text-incident' : 'text-ink',
          note: before?.replay ? 'before any fix' : 'measuring now',
        },
        commands,
      ]
    }
    return [
      { label: 'Time open', value: duration(openFor) },
      {
        label: exploitLabel(incident),
        value: before ? passFail(before.reproPassed) : '…',
        tone: before && !before.reproPassed ? 'text-incident' : 'text-ink',
        note: before ? 'before any fix' : 'measuring now',
      },
      {
        label: 'Regression suite',
        value: before ? `${before.suitePassed}/${before.suiteTotal}` : '…',
        note: before ? 'before any fix' : 'measuring now',
      },
      commands,
    ]
  }

  if (phase === 'review') {
    if (!replayed) {
      return [
        {
          label: exploitLabel(incident),
          value: after ? passFail(after.reproPassed) : '-',
          tone: after?.reproPassed ? 'text-healthy' : 'text-incident',
          note: before ? `${passFail(before.reproPassed)} before the patch` : undefined,
        },
        hidden,
        {
          label: 'Regression suite',
          value: after ? `${after.suitePassed}/${after.suiteTotal}` : '-',
          tone: after && after.suiteTotal > 0 && after.suitePassed === after.suiteTotal ? 'text-healthy' : 'text-incident',
          note: before ? `${before.suitePassed}/${before.suiteTotal} before the patch` : undefined,
        },
      ]
    }
    return [
      {
        label: 'Attacks that succeed',
        value: after?.replay ? `${after.replay.attacksSucceeded}/${after.replay.attacksTotal}` : '-',
        tone: after?.replay && after.replay.attacksSucceeded === 0 ? 'text-healthy' : 'text-incident',
        note: before?.replay ? `${before.replay.attacksSucceeded}/${before.replay.attacksTotal} before the patch` : undefined,
      },
      hidden,
      {
        label: 'Legit transfers blocked',
        value: after?.replay ? `${after.replay.legitBlocked}/${after.replay.legitTotal}` : '-',
        tone: after?.replay && after.replay.legitBlocked === 0 ? 'text-healthy' : 'text-incident',
      },
    ]
  }

  const sandboxFact = { label: 'Sandboxes destroyed', value: sandboxes.length ? `${destroyed}/${sandboxes.length}` : '-' }

  if (phase === 'resolved') {
    return [
      { label: 'Detection to resolution', value: duration(openFor) },
      hasImpact(incident)
        ? { label: 'Transfers listed for reversal', value: impact.unauthorizedTransfers ?? '-' }
        : { ...hidden, note: undefined },
      sandboxFact,
    ]
  }

  // failed / rejected
  let middle = null
  if (hasImpact(incident)) {
    middle = { label: 'Unauthorized transfers', value: impact.unauthorizedTransfers ?? '-', tone: 'text-incident' }
  } else if (v) {
    middle = { ...hidden, tone: v.hiddenTotal > 0 && v.hiddenPassed === v.hiddenTotal ? 'text-healthy' : 'text-incident' }
  } else if (before) {
    middle = {
      label: exploitLabel(incident),
      value: passFail(before.reproPassed),
      tone: before.reproPassed ? 'text-ink' : 'text-incident',
      note: 'before any fix',
    }
  }
  return [{ label: 'Time open', value: duration(openFor) }, middle, sandboxFact]
}
