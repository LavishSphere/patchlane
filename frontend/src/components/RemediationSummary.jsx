import { CircleCheck, CircleX, LoaderCircle } from 'lucide-react'
import { pct } from '../utils/format'
import { CardHeader, Pill } from './ui'

const RISK = { low: 'healthy', medium: 'warning', high: 'incident' }

/** Droid's structured RemediationResult: root cause, patch, risk, its own checks. */
export default function RemediationSummary({ incident }) {
  const r = incident?.remediation
  const working = incident && ['diagnosing', 'patching'].includes(incident.status)

  if (!r) {
    return (
      <section aria-labelledby="diagnosis-title" className="rounded-2xl border border-dashed border-[#d6d1c7] p-6">
        <CardHeader id="diagnosis-title" eyebrow="Factory Droid · structured result" title="Root cause" />
        <p className="mt-4 flex items-center gap-2 text-[16px] text-muted">
          {working && <LoaderCircle className="spin size-4" aria-hidden="true" />}
          {working
            ? 'Droid is still working. It reports back with a typed result: root cause, changed files, risk and confidence.'
            : 'No result from Droid for this incident.'}
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby="diagnosis-title" className="card">
      <CardHeader id="diagnosis-title" eyebrow="Factory Droid · structured result" title="Root cause" />
      <p className="mt-4 text-[18px] leading-relaxed text-ink">{r.rootCause}</p>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-5">
        <div className="col-span-2">
          <dt className="text-[13px] text-muted">The fix</dt>
          <dd className="mt-1 text-[16px] leading-relaxed text-ink">{r.patchSummary}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[13px] text-muted">Files Droid changed</dt>
          <dd className="mt-1.5 flex flex-wrap gap-1.5">
            {r.changedFiles.map((f) => (
              <span key={f} className="rounded-md bg-subtle px-2 py-0.5 font-mono text-[14px] text-ink">
                {f}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted">Risk</dt>
          <dd className="mt-1.5">
            <Pill tone={RISK[r.risk] ?? 'muted'} className="capitalize">
              {r.risk}
            </Pill>
          </dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted">Droid’s confidence</dt>
          <dd className="num mt-0.5 text-[20px] font-semibold text-ink">{pct(r.confidence)}</dd>
        </div>
      </dl>

      {r.testsRun?.length > 0 && (
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-[13px] text-muted">
            Droid’s own checks, in its sandbox <span className="text-faint">· informative only, not the verdict</span>
          </h3>
          <ul className="mt-2 space-y-2.5">
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
