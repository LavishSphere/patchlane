import { ArrowDown, CircleCheck, CircleX, LoaderCircle } from 'lucide-react'
import { chalkForCase, chalkRunsText } from '../utils/chalk'
import { hasReplay } from '../utils/status'
import { Heading, Pill } from './ui'

// Values: { text, tone } where tone is good | bad | neutral | pending | none
const TONE = {
  good: 'text-healthy',
  bad: 'text-incident',
  neutral: 'text-ink',
  pending: 'text-muted font-normal',
  none: 'text-faint font-normal',
}

const NONE = { text: '-', tone: 'none' }
const NA = { text: 'n/a', tone: 'none' }

function frac(a, b, goodWhen) {
  if (typeof a !== 'number' || typeof b !== 'number') return NONE
  return { text: `${a}/${b}`, tone: goodWhen == null ? 'neutral' : goodWhen ? 'good' : 'bad' }
}

/** Before (agent sandbox) vs after (clean sandbox), straight from the snapshot. */
function evidenceRows(incident) {
  const status = incident?.status
  const before = incident?.before
  const v = incident?.verification
  const after = v?.after
  const measuringBefore = !before && (status === 'sandbox_creating' || status === 'reproducing')
  const verifying = !v && status === 'verifying'
  const pendingBefore = measuringBefore ? { text: 'measuring', tone: 'pending' } : NONE
  const pendingAfter = verifying ? { text: 'running', tone: 'pending' } : NONE
  const noReplay = { text: 'not replayed', tone: 'none' }

  const b = before?.replay
  const a = after?.replay

  const modified = [...(v?.rejectedPaths ?? []), ...(v?.droppedAgentTests ?? [])]

  const rows = [
    {
      label: 'Attacks that succeed',
      replay: true,
      before: b ? frac(b.attacksSucceeded, b.attacksTotal, b.attacksSucceeded === 0) : before ? noReplay : pendingBefore,
      after: a ? frac(a.attacksSucceeded, a.attacksTotal, a.attacksSucceeded === 0) : after ? noReplay : pendingAfter,
    },
    {
      label: 'Legitimate transfers blocked',
      replay: true,
      before: b ? frac(b.legitBlocked, b.legitTotal, null) : before ? noReplay : pendingBefore,
      after: a ? frac(a.legitBlocked, a.legitTotal, a.legitBlocked === 0) : after ? noReplay : pendingAfter,
    },
    {
      label: 'Exploit test',
      before: before ? { text: before.reproPassed ? 'Pass' : 'Fail', tone: before.reproPassed ? 'neutral' : 'bad' } : pendingBefore,
      after: after ? { text: after.reproPassed ? 'Pass' : 'Fail', tone: after.reproPassed ? 'good' : 'bad' } : pendingAfter,
    },
    {
      label: 'Held-out tests',
      hint: 'Droid never saw these',
      before: NA,
      after: v && v.hiddenTotal > 0 ? frac(v.hiddenPassed, v.hiddenTotal, v.hiddenPassed === v.hiddenTotal) : v ? NONE : pendingAfter,
    },
    {
      label: 'Regression suite',
      before: before ? frac(before.suitePassed, before.suiteTotal, null) : pendingBefore,
      after: after ? frac(after.suitePassed, after.suiteTotal, after.suiteTotal > 0 && after.suitePassed === after.suiteTotal) : pendingAfter,
    },
    {
      label: 'Test files modified',
      before: NA,
      after: v
        ? modified.length || v.tampering
          ? { text: modified.length ? modified.join(', ') : 'yes', tone: 'bad', small: true }
          : { text: 'none', tone: 'good' }
        : pendingAfter,
    },
  ]
  // Cases without incident transfers have no replay rows to show.
  return hasReplay(incident) ? rows : rows.filter((row) => !row.replay)
}

/** `benchmark` is passed in live mode only, to show the Chalk benchmark for this case beside the verdict. */
export default function RemediationEvidence({ incident, benchmark }) {
  const rows = evidenceRows(incident)
  const v = incident?.verification
  const verdict = v?.verdict
  const verifying = incident?.status === 'verifying'

  return (
    <section id="results" aria-labelledby="evidence-title" className="min-w-0 scroll-mt-32">
      <Heading id="evidence-title" aside={<VerdictPill verdict={verdict} verifying={verifying} />}>
        Results
      </Heading>
      <p className="mt-2 max-w-[40rem] text-[15px] leading-relaxed text-body">
        Measured by Patchlane verification. The before column comes from the agent sandbox, ahead of any change. The after
        column comes from the clean sandbox, with only the source diff applied.
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Measurements in the agent sandbox before the patch and in the clean verification sandbox after it
          </caption>
          <thead>
            <tr className="border-b border-line-strong">
              <th scope="col" className="pb-2.5 text-[14px] font-medium text-muted sm:w-[46%]">
                Check
              </th>
              <th scope="col" className="pb-2.5 text-right align-bottom">
                <span className="block text-[14px] font-semibold text-ink">Before</span>
                <span className="block text-[12.5px] font-normal whitespace-nowrap text-muted">agent sandbox</span>
              </th>
              <th scope="col" className="pb-2.5 pl-3 text-right align-bottom sm:pl-4">
                <span className="block text-[14px] font-semibold text-ink">After</span>
                <span className="block text-[12.5px] font-normal whitespace-nowrap text-muted">clean sandbox</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-line">
                <th scope="row" className="py-3 pr-3 text-[15px] leading-snug font-normal text-ink sm:text-[16px]">
                  {row.label}
                  {row.hint && <span className="block text-[13px] text-muted">{row.hint}</span>}
                </th>
                <Cell value={row.before} />
                <Cell value={row.after} pad />
              </tr>
            ))}
            <tr>
              <th scope="row" className="pt-4 text-[16px] font-semibold text-ink">
                Verdict
              </th>
              <td colSpan={2} className="pt-4 pl-3 text-right">
                <VerdictPill verdict={verdict} verifying={verifying} large />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {v?.reasons?.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-xl border border-incident/30 bg-incident-soft px-4 py-3 text-[15px] text-incident">
          {v.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {benchmark && ['awaiting_approval', 'resolved'].includes(incident?.status) && (
        <ChalkCaseLine benchmark={benchmark} incident={incident} />
      )}

      <p className="mt-4 text-[14px] leading-relaxed text-muted">
        The held-out tests are never copied into Droid’s sandbox. Any change outside the service source, such as an edited
        test file, fails verification.
      </p>
    </section>
  )
}

/** The Chalk benchmark for this incident's case. Kept apart from this run's verdict. */
function ChalkCaseLine({ benchmark, incident }) {
  const c = chalkForCase(benchmark, incident.caseId)
  if (!c) return null
  const variant = incident.variantId && incident.variantId !== 'default'
  const label = variant ? 'Chalk benchmark for the original bug on this safeguard' : 'Chalk benchmark for this case'

  let body
  if (!c.available) body = <span className="text-muted">Chalk evaluation unavailable</span>
  else if (!c.runs) body = <span className="text-muted">not scored yet</span>
  else {
    body = (
      <>
        <span className="num text-ink">{chalkRunsText(c, { short: true })}</span>
        {c.evaluationId && (
          <>
            {' '}
            <span className="whitespace-nowrap">
              (evaluation <span className="font-mono text-[13.5px]">{c.evaluationId}</span>)
            </span>
          </>
        )}
      </>
    )
  }

  return (
    <div className="mt-5 border-t border-line pt-4 text-[15px] leading-relaxed text-body">
      <p>
        <span className="font-semibold text-ink">{label}:</span> {body}.{' '}
        <a href="#benchmark" className="link inline-flex items-center gap-1 whitespace-nowrap">
          Benchmark
          <ArrowDown className="size-3.5" aria-hidden="true" />
        </a>
      </p>
      <p className="mt-1 text-[14px] text-muted">
        {variant ? 'This variant hasn’t been benchmarked. ' : ''}Chalk doesn’t score live runs. The verdict above comes from
        Patchlane verification of this run.
      </p>
    </div>
  )
}

function Cell({ value, pad }) {
  return (
    <td
      className={`num py-3 text-right font-bold whitespace-nowrap ${pad ? 'pl-3 sm:pl-4' : ''} ${
        value.small ? 'text-[14px] whitespace-normal' : 'text-[18px] sm:text-[20px]'
      } ${TONE[value.tone]}`}
    >
      {value.tone === 'pending' ? (
        <span className="inline-flex items-center gap-1.5 text-[15px]">
          <LoaderCircle className="spin size-4" aria-hidden="true" />
          {value.text}
        </span>
      ) : (
        value.text
      )}
    </td>
  )
}

function VerdictPill({ verdict, verifying, large }) {
  const size = large ? 'px-3.5 py-1.5 text-[15px]' : ''
  if (verdict === 'safe_to_review') {
    return (
      <Pill tone="healthy" className={size}>
        <CircleCheck className="size-4" aria-hidden="true" />
        Safe to review
      </Pill>
    )
  }
  if (verdict === 'failed') {
    return (
      <Pill tone="incident" className={size}>
        <CircleX className="size-4" aria-hidden="true" />
        Failed verification
      </Pill>
    )
  }
  return (
    <Pill tone="muted" className={size}>
      {verifying ? 'Verifying…' : 'Not verified yet'}
    </Pill>
  )
}
