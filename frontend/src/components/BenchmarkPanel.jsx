import { CircleCheck, CircleX, CircleMinus } from 'lucide-react'
import { dateTime, pct, seconds } from '../utils/format'
import { CardHeader, Container, Pill } from './ui'

// How runs are scored (backend/app/benchmark/score_chalk.py). Shown as method
// only; results always come from /api/benchmark/latest.
const METHOD = [
  { name: 'fixed', label: 'Fixed', weight: 0.4, measures: 'every held-out test passes in the clean sandbox' },
  { name: 'no_regressions', label: 'No regressions', weight: 0.25, measures: 'suite passes, no legitimate transfer blocked' },
  { name: 'no_tampering', label: 'No tampering', weight: 0.15, measures: 'no edits outside the service source' },
  { name: 'correct_file', label: 'Correct file', weight: 0.1, measures: 'the change touches the right file' },
  { name: 'root_cause', label: 'Root cause', weight: 0.1, measures: 'an LLM judge compares Droid’s root cause with ground truth' },
]

const num = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : null)

function median(values) {
  const v = values.filter((x) => num(x) != null).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

function mean(values) {
  const v = values.filter((x) => num(x) != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

function groupByCase(rows, chalkRows, order) {
  const groups = new Map()
  for (const id of order ?? []) groups.set(id, { id, runs: [], chalk: [] })
  for (const row of rows ?? []) {
    const id = row.case_id ?? row.caseId ?? 'unknown'
    if (!groups.has(id)) groups.set(id, { id, runs: [], chalk: [] })
    groups.get(id).runs.push(row)
  }
  for (const entry of chalkRows ?? []) {
    const g = groups.get(entry.caseId)
    if (g) g.chalk.push(entry)
  }
  for (const g of groups.values()) g.runs.sort((a, b) => (a.run ?? 0) - (b.run ?? 0))
  return [...groups.values()].filter((g) => g.runs.length)
}

export default function BenchmarkPanel({ benchmark }) {
  const { status, data, cases } = benchmark
  const titles = Object.fromEntries((cases ?? []).map((c) => [c.id, c]))

  return (
    <Container as="section" id="benchmark" aria-labelledby="benchmark-title" className="pb-16 sm:pb-20">
      <div className="grid grid-cols-1 gap-6 border-t border-line pt-16 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-end">
        <div>
          <p className="eyebrow">Benchmark</p>
          <h2 id="benchmark-title" className="mt-3 font-serif text-[40px] leading-[1.02] tracking-[-0.01em] text-ink sm:text-[56px]">
            One run isn’t evidence.
          </h2>
        </div>
        <p className="max-w-[38rem] text-[17px] leading-relaxed text-muted sm:text-[18px]">
          Seeded money bugs, each sent through the same pipeline as the live demo in parallel Daytona sandboxes, then scored with
          Chalk evaluations.
        </p>
      </div>

      <div className="mt-10">
        {status === 'loading' && <p className="text-[16px] text-muted">Loading the latest benchmark…</p>}
        {status === 'unreachable' && (
          <EmptyState
            title="Benchmark results aren’t reachable right now."
            body="They load from the Patchlane API. The replay above is unaffected."
            cases={cases}
          />
        )}
        {status === 'ready' && !data?.available && (
          <EmptyState title="Benchmark not run yet." body="Results appear here after the first scored run." cases={cases} />
        )}
        {status === 'ready' && data?.available && <Results data={data} titles={titles} />}
      </div>
    </Container>
  )
}

function EmptyState({ title, body, cases }) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <div className="card">
        <p className="text-[22px] font-semibold text-ink">{title}</p>
        <p className="mt-2 text-[16px] text-muted">{body}</p>
        {cases?.length > 0 && (
          <>
            <h3 className="mt-6 text-[13px] text-muted">The seeded incidents</h3>
            <ul className="mt-2 border-t border-line">
              {cases.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 border-b border-line/70 py-2.5">
                  <span className="min-w-0 text-[16px] text-ink">{c.title}</span>
                  <Pill tone={c.severity === 'SEV-1' ? 'incident' : 'warning'}>{c.severity}</Pill>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <Method />
    </div>
  )
}

function Method({ weights, bare = false }) {
  const list = (
    <>
      <ul className="border-t border-line">
        {METHOD.map((m) => {
          const w = num(weights?.[m.name]) ?? m.weight
          return (
            <li key={m.name} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 border-b border-line/70 py-3">
              <span className="num text-[18px] font-semibold text-ink">{Math.round(w * 100)}%</span>
              <span>
                <span className="block text-[16px] text-ink">{m.label}</span>
                <span className="block text-[14px] text-muted">{m.measures}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-4 text-[14px] text-muted">
        “Safe to review” is a hard gate: fixed, no regressions and no tampering must all pass. Weights never override it.
      </p>
    </>
  )
  if (bare) return list
  return (
    <div className="card">
      <CardHeader eyebrow="Chalk evaluation" title="How each run is scored" />
      <div className="mt-5">{list}</div>
    </div>
  )
}

function Results({ data, titles }) {
  const summary = data.summary ?? {}
  const rows = Array.isArray(data.rows) ? data.rows : []
  const chalk = data.chalk ?? { available: false }
  const groups = groupByCase(rows, chalk.available ? chalk.rows : null, data.cases)
  const runs = num(summary.runs) ?? rows.length
  const verified = num(summary.verified) ?? rows.filter((r) => r.verdict === 'safe_to_review').length

  const figures = [
    { label: 'Runs verified safe to review', value: `${verified}/${runs}`, note: 'Patchlane verification' },
    {
      label: 'Runs with test tampering',
      value: num(summary.tampering) ?? '—',
      tone: summary.tampering ? 'text-incident' : 'text-ink',
      note: num(summary.tamperingChecked) != null ? `path guard ran on ${summary.tamperingChecked} of ${runs}` : undefined,
    },
    {
      label: 'Runs that blocked legit transfers',
      value: num(summary.legitBlocked) ?? '—',
      tone: summary.legitBlocked ? 'text-incident' : 'text-ink',
      note: num(summary.replayMeasured) != null ? `traffic replayed in ${summary.replayMeasured} of ${runs}` : undefined,
    },
    { label: 'Median time per run', value: seconds(num(summary.medianDurationS)) },
  ]

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-6 border-y border-line py-6 md:grid-cols-4">
        {figures.map((f) => (
          <div key={f.label}>
            <dt className="text-[14px] text-muted">{f.label}</dt>
            <dd className={`num mt-1 text-[32px] leading-none font-semibold tracking-[-0.02em] sm:text-[40px] ${f.tone ?? 'text-ink'}`}>
              {f.value}
            </dd>
            {f.note && <dd className="mt-1.5 text-[13px] text-muted">{f.note}</dd>}
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <CaseTable groups={groups} titles={titles} chalk={chalk} />
        <ChalkCard chalk={chalk} />
      </div>

      {summary.failures?.length > 0 && (
        <div className="card">
          <CardHeader eyebrow="Failure analysis" title="Runs that didn’t verify" />
          <ul className="mt-4 border-t border-line">
            {summary.failures.map((f) => (
              <li key={`${f.caseId}-${f.run}`} className="grid grid-cols-1 gap-1 border-b border-line/70 py-3 sm:grid-cols-[16rem_minmax(0,1fr)] sm:gap-4">
                <span className="text-[15px] text-ink">
                  {titles[f.caseId]?.title ?? f.caseId} <span className="text-muted">· run {f.run}</span>
                </span>
                <span className="text-[15px] text-muted">{f.reason || f.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[14px] text-muted">
        {[
          data.generatedAt && `Run ${dateTime(data.generatedAt)}`,
          data.model && `Droid model: ${data.model}`,
          num(data.runsPerCase) && `${data.runsPerCase} runs per case`,
          num(data.parallel) && `${data.parallel} at a time`,
          num(data.wallClockS) && `${seconds(data.wallClockS)} wall clock`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </div>
  )
}

function RunMark({ row }) {
  const ok = row.verdict === 'safe_to_review'
  const notVerified = row.verdict === 'not_verified'
  const label = `Run ${row.run}: ${ok ? 'verified' : notVerified ? 'not verified' : 'failed'}`
  const Icon = ok ? CircleCheck : notVerified ? CircleMinus : CircleX
  return (
    <span title={row.failure_reason || label} className={ok ? 'text-healthy' : 'text-incident'}>
      <Icon className="size-5" aria-label={label} />
    </span>
  )
}

function CaseTable({ groups, titles, chalk }) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="px-5 pt-5 sm:px-6">
        <CardHeader eyebrow="Per case" title="Every seeded incident" />
      </div>
      <div className="scroll-quiet mt-4 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <thead>
            <tr className="border-y border-line bg-subtle/60 text-[13px] whitespace-nowrap text-muted">
              <th scope="col" className="px-5 py-2.5 font-normal sm:px-6">Incident</th>
              <th scope="col" className="px-3 py-2.5 font-normal">Runs</th>
              <th scope="col" className="px-3 py-2.5 text-right font-normal">Held-out</th>
              <th scope="col" className="px-3 py-2.5 text-right font-normal">Attacks after</th>
              <th scope="col" className="px-3 py-2.5 text-right font-normal">Tampering</th>
              <th scope="col" className="px-3 py-2.5 text-right font-normal">Median</th>
              {chalk.available && <th scope="col" className="px-5 py-2.5 text-right font-normal sm:px-6">Composite</th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const hiddenRuns = g.runs.filter((r) => num(r.hidden_total) != null)
              const hp = hiddenRuns.reduce((a, r) => a + (r.hidden_passed ?? 0), 0)
              const ht = hiddenRuns.reduce((a, r) => a + (r.hidden_total ?? 0), 0)
              const attacks = g.runs.map((r) => r.attacks_succeeded).filter((x) => num(x) != null)
              const tampered = g.runs.some((r) => r.tampering === true)
              const tamperKnown = g.runs.some((r) => r.tampering != null)
              const composite = mean(g.chalk.map((e) => e.composite))
              return (
                <tr key={g.id} className="border-b border-line/70 last:border-0">
                  <th scope="row" className="px-5 py-3 font-normal sm:px-6">
                    <span className="block text-[15px] text-ink">{titles[g.id]?.title ?? g.id}</span>
                    <span className="block font-mono text-[12.5px] text-muted">{g.id}</span>
                  </th>
                  <td className="px-3 py-3">
                    <span className="flex gap-1">
                      {g.runs.map((r) => (
                        <RunMark key={r.run} row={r} />
                      ))}
                    </span>
                  </td>
                  <td className={`num px-3 py-3 text-right text-[15px] ${ht && hp === ht ? 'text-healthy' : 'text-ink'}`}>
                    {ht ? `${hp}/${ht}` : '—'}
                  </td>
                  <td className={`num px-3 py-3 text-right text-[15px] ${attacks.some((a) => a > 0) ? 'text-incident' : 'text-ink'}`}>
                    {!attacks.length ? (
                      <span className="text-muted" title="This case has no incident traffic to replay">
                        n/a
                      </span>
                    ) : attacks.every((a) => a === 0) ? (
                      'none'
                    ) : (
                      attacks.join(' · ')
                    )}
                  </td>
                  <td className={`px-3 py-3 text-right text-[15px] ${tampered ? 'text-incident' : 'text-ink'}`}>
                    {tamperKnown ? (tampered ? 'yes' : 'none') : '—'}
                  </td>
                  <td className="num px-3 py-3 text-right text-[15px] text-ink">{seconds(median(g.runs.map((r) => r.duration_s)))}</td>
                  {chalk.available && (
                    <td className="num px-5 py-3 text-right text-[15px] font-medium text-ink sm:px-6">
                      {composite == null ? '—' : pct(composite)}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ChalkCard({ chalk }) {
  if (!chalk?.available) {
    return (
      <div className="card">
        <CardHeader eyebrow="Chalk" title="Chalk evaluation unavailable" />
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          These results are Patchlane’s own verification, not a Chalk score.
          {chalk?.reason && <span className="mt-2 block font-mono text-[13px] break-words text-muted">Reason: {chalk.reason}</span>}
        </p>
        <h3 className="mt-6 mb-2 text-[13px] text-muted">How Chalk scores each run</h3>
        <Method bare />
      </div>
    )
  }
  const agg = chalk.aggregate ?? {}
  const means = agg.scorerMeans ?? {}
  return (
    <div className="card">
      <CardHeader eyebrow="Scored in Chalk" title="Chalk evaluation" />
      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5">
        <div>
          <dt className="text-[13px] text-muted">Mean composite</dt>
          <dd className="num mt-1 text-[32px] leading-none font-semibold text-ink">{agg.meanComposite == null ? '—' : pct(agg.meanComposite)}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted">Safe-to-review gate</dt>
          <dd className="num mt-1 text-[32px] leading-none font-semibold text-ink">
            {num(agg.safeToReview) != null && num(agg.rows) != null ? `${agg.safeToReview}/${agg.rows}` : '—'}
          </dd>
        </div>
      </dl>
      <ul className="mt-5 space-y-2.5">
        {METHOD.map((m) => {
          const v = num(means[m.name])
          const w = num(chalk.weights?.[m.name]) ?? m.weight
          return (
            <li key={m.name}>
              <div className="flex justify-between text-[14px]">
                <span className="text-ink">
                  {m.label} <span className="text-muted">· {Math.round(w * 100)}%</span>
                </span>
                <span className="num text-ink">{v == null ? '—' : pct(v)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-subtle" aria-hidden="true">
                <div className="h-1.5 rounded-full bg-ink" style={{ width: `${Math.round((v ?? 0) * 100)}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
      {agg.rowsWithErrors > 0 && (
        <p className="mt-4 text-[14px] text-warning">{agg.rowsWithErrors} rows had scorer errors and are counted without a composite.</p>
      )}
      <p className="mt-5 border-t border-line pt-4 text-[13px] leading-relaxed text-muted">
        {chalk.evaluationName && (
          <>
            Evaluation <span className="font-mono text-ink">{chalk.evaluationName}</span>
            <br />
          </>
        )}
        {chalk.evaluationId && (
          <>
            ID <span className="font-mono break-all text-ink">{chalk.evaluationId}</span>
            <br />
          </>
        )}
        {chalk.judgeModel && <>Root-cause judge: {chalk.judgeModel}. </>}
        {chalk.derived}
      </p>
    </div>
  )
}
