import { CircleCheck, CircleX, LoaderCircle } from 'lucide-react'
import { CardHeader, Pill } from './ui'

// Values: { text, tone } where tone is good | bad | neutral | pending | none
const TONE = {
  good: 'text-healthy',
  bad: 'text-incident',
  neutral: 'text-ink',
  pending: 'text-muted font-normal',
  none: 'text-faint font-normal',
}

const NONE = { text: '—', tone: 'none' }

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

  return [
    {
      label: 'Attacks that succeed',
      before: b ? frac(b.attacksSucceeded, b.attacksTotal, b.attacksSucceeded === 0) : before ? noReplay : pendingBefore,
      after: a ? frac(a.attacksSucceeded, a.attacksTotal, a.attacksSucceeded === 0) : after ? noReplay : pendingAfter,
    },
    {
      label: 'Legit transfers blocked',
      before: b ? frac(b.legitBlocked, b.legitTotal, null) : before ? noReplay : pendingBefore,
      after: a ? frac(a.legitBlocked, a.legitTotal, a.legitBlocked === 0) : after ? noReplay : pendingAfter,
    },
    {
      label: 'Exploit test',
      before: before ? { text: before.reproPassed ? 'PASS' : 'FAIL', tone: before.reproPassed ? 'neutral' : 'bad' } : pendingBefore,
      after: after ? { text: after.reproPassed ? 'PASS' : 'FAIL', tone: after.reproPassed ? 'good' : 'bad' } : pendingAfter,
    },
    {
      label: 'Held-out tests',
      hint: 'Droid never saw these',
      before: NONE,
      after: v && v.hiddenTotal > 0 ? frac(v.hiddenPassed, v.hiddenTotal, v.hiddenPassed === v.hiddenTotal) : v ? NONE : pendingAfter,
    },
    {
      label: 'Regression suite',
      before: before ? frac(before.suitePassed, before.suiteTotal, null) : pendingBefore,
      after: after ? frac(after.suitePassed, after.suiteTotal, after.suiteTotal > 0 && after.suitePassed === after.suiteTotal) : pendingAfter,
    },
    {
      label: 'Test files modified',
      before: NONE,
      after: v
        ? modified.length || v.tampering
          ? { text: modified.length ? modified.join(', ') : 'yes', tone: 'bad', small: true }
          : { text: 'none', tone: 'good' }
        : pendingAfter,
    },
  ]
}

export default function RemediationEvidence({ incident }) {
  const rows = evidenceRows(incident)
  const v = incident?.verification
  const verdict = v?.verdict

  return (
    <section aria-labelledby="evidence-title" className="card">
      <CardHeader
        id="evidence-title"
        eyebrow="Patchlane verification"
        title="Before and after"
        aside={<VerdictPill verdict={verdict} verifying={incident?.status === 'verifying'} />}
      />

      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Measurements in the agent sandbox before the patch and in the clean verification sandbox after it
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="w-[44%] min-w-[7.5rem] pb-3 text-[14px] font-normal text-muted">
                <span className="sr-only">Check</span>
              </th>
              <th scope="col" className="pb-3 text-right align-bottom">
                <span className="block text-[15px] font-semibold text-ink">Before</span>
                <span className="block text-[12.5px] font-normal whitespace-nowrap text-muted">agent sandbox</span>
              </th>
              <th scope="col" className="pb-3 pl-3 text-right align-bottom sm:pl-4">
                <span className="block text-[15px] font-semibold text-ink">After</span>
                <span className="block text-[12.5px] font-normal whitespace-nowrap text-muted">clean sandbox</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-line/70">
                <th scope="row" className="py-3.5 pr-3 text-[15px] leading-snug font-normal text-ink sm:text-[17px]">
                  {row.label}
                  {row.hint && <span className="block text-[13px] text-muted">{row.hint}</span>}
                </th>
                <Cell value={row.before} />
                <Cell value={row.after} pad />
              </tr>
            ))}
            <tr>
              <th scope="row" className="pt-4 text-[16px] font-medium text-ink sm:text-[17px]">
                Verdict
              </th>
              <td />
              <td className="pt-4 pl-4 text-right">
                <VerdictPill verdict={verdict} verifying={incident?.status === 'verifying'} large />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {v?.reasons?.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-xl bg-incident-soft px-4 py-3 text-[15px] text-incident">
          {v.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      <p className="mt-5 text-[14px] leading-relaxed text-muted">
        “Before” is measured in Droid’s sandbox ahead of any change. “After” comes from a fresh sandbox that applies only the
        source diff. Held-out tests never enter Droid’s sandbox, and edits to tests are rejected.
      </p>
    </section>
  )
}

function Cell({ value, pad }) {
  return (
    <td
      className={`num py-3.5 text-right font-semibold whitespace-nowrap ${pad ? 'pl-3 sm:pl-4' : ''} ${
        value.small ? 'text-[14px] whitespace-normal' : 'text-[18px] sm:text-[21px]'
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
