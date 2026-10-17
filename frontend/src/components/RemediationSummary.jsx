import { CircleCheck, CircleX, LoaderCircle } from 'lucide-react'
import { pct } from '../utils/format'
import { Heading, Pill } from './ui'

const RISK = { low: 'healthy', medium: 'warning', high: 'incident' }

/** Droid's structured RemediationResult: root cause, patch, risk, its own checks. */
export default function RemediationSummary({ incident }) {
  const r = incident?.remediation
  const working = incident && ['diagnosing', 'patching'].includes(incident.status)

  if (!r) {
    return (
      <section aria-labelledby="diagnosis-title" className="min-w-0">
        <Heading id="diagnosis-title">Root cause</Heading>
        <p className="mt-3 flex items-start gap-2 text-[16px] leading-relaxed text-body">
          {working && <LoaderCircle className="spin mt-1 size-4 shrink-0 text-accent" aria-hidden="true" />}
          {working
            ? 'Droid is still working. When it finishes it reports the root cause, the files it changed, a risk level and how confident it is.'
            : 'Droid didn’t return a result for this incident.'}
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby="diagnosis-title" className="min-w-0">
      <Heading id="diagnosis-title">Root cause</Heading>
      <p className="mt-1 text-[14px] text-muted">From Droid’s structured report</p>
      <p className="mt-4 text-[18px] leading-relaxed text-ink">{r.rootCause}</p>

      <dl className="mt-6 border-t border-line text-[15px]">
        <Row label="Fix">
          <span className="leading-relaxed text-body">{r.patchSummary}</span>
        </Row>
        <Row label="Files changed">
          <span className="flex flex-wrap gap-1.5">
            {r.changedFiles.map((f) => (
              <span key={f} className="rounded-md border border-line bg-surface px-2 py-0.5 font-mono text-[13.5px] text-ink">
                {f}
              </span>
            ))}
          </span>
        </Row>
        <Row label="Risk">
          <Pill tone={RISK[r.risk] ?? 'muted'} className="capitalize">
            {r.risk}
          </Pill>
        </Row>
        <Row label="Confidence">
          <span className="num font-semibold text-ink">{pct(r.confidence)}</span>
          <span className="text-muted"> (Droid’s own estimate)</span>
        </Row>
      </dl>

      {r.testsRun?.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[15px] font-bold text-ink">Droid’s own test runs</h3>
          <p className="mt-0.5 text-[14px] text-muted">These ran in the agent sandbox. The verdict comes from the clean sandbox.</p>
          <ul className="mt-3 space-y-2.5">
            {r.testsRun.map((t, i) => (
              <li key={`${t.command}-${i}`} className="flex gap-2.5">
                {t.passed ? (
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-healthy" aria-label="passed" />
                ) : (
                  <CircleX className="mt-0.5 size-4 shrink-0 text-incident" aria-label="failed" />
                )}
                <div className="min-w-0">
                  <code className="block font-mono text-[13.5px] break-all text-ink">{t.command}</code>
                  <p className="text-[14px] text-muted">{t.summary}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-4 border-b border-line py-3">
      <dt className="text-[14px] text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}
