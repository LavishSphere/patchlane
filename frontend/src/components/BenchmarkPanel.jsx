import { CircleCheck, CircleMinus, CircleX } from 'lucide-react'
import { dateTime, seconds } from '../utils/format'
import { Container, Heading, Pill } from './ui'

// How runs are scored (backend/app/benchmark/score_chalk.py). Shown as method
// only; results always come from /api/benchmark/latest.
const METHOD = [
  { name: 'fixed', label: 'Fixed', weight: 0.4, measures: 'Every held-out test passes in the clean sandbox' },
  { name: 'no_regressions', label: 'No regressions', weight: 0.25, measures: 'The suite passes and no legitimate transfer is blocked' },
  { name: 'no_tampering', label: 'No tampering', weight: 0.15, measures: 'No edits outside the service source' },
  { name: 'correct_file', label: 'Correct file', weight: 0.1, measures: 'The change touches the file with the bug' },
  { name: 'root_cause', label: 'Root cause', weight: 0.1, measures: 'An LLM judge compares Droid’s root cause with the known one' },
]

const num = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : null)
const score = (v) => (num(v) == null ? '-' : v.toFixed(2))

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

function times(n) {
  if (n === 1) return 'once'
  if (n === 2) return 'twice'
  return `${n} times`
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
    <Container as="section" id="benchmark" aria-labelledby="benchmark-title" className="scroll-mt-28">
      <div className="border-t border-line py-14 sm:py-16">
        <Heading id="benchmark-title">Benchmark</Heading>
        {status === 'loading' && <p className="mt-4 text-[16px] text-muted">Loading the latest benchmark…</p>}
        {status === 'unreachable' && (
          <EmptyState
            title="The benchmark results can’t be loaded right now."
            body="They come from the Patchlane API. The replay above works without them."
            cases={cases}
          />
        )}
        {status === 'ready' && !data?.available && (
          <EmptyState title="No benchmark has been run yet." body="Results show up here after the first scored run." cases={cases} />
        )}
        {status === 'ready' && data?.available && <Results data={data} titles={titles} />}
      </div>
    </Container>
  )
}

function EmptyState({ title, body, cases }) {
  return (
    <div className="mt-4">
      <p className="text-[17px] font-semibold text-ink">{title}</p>
      <p className="mt-1 text-[16px] text-body">{body}</p>
      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {cases?.length > 0 && (
          <div>
            <h3 className="text-[17px] font-bold text-ink">The seeded bugs</h3>
            <ul className="mt-3 border-t border-line">
              {cases.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 border-b border-line py-2.5">
                  <span className="min-w-0 text-[16px] text-ink">{c.title}</span>
                  <Pill tone={c.severity === 'SEV-1' ? 'incident' : 'warning'}>{c.severity}</Pill>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Scoring />
      </div>
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
  const agg = chalk.aggregate ?? {}
  const scored = num(agg.rowsScored)

  return (
    <div>
      <div className="mt-3 max-w-[48rem] space-y-3 text-[16px] leading-relaxed text-body">
        <p>
          Each of the {groups.length} seeded bugs below went through the full pipeline
          {num(data.runsPerCase) ? ` ${times(data.runsPerCase)}` : ''}, in fresh Daytona sandboxes
          {num(data.parallel) ? ` with ${data.parallel} runs going at once` : ''}. Each bug has its own held-out tests, which Droid
          never sees.
        </p>
        <p>
          <span className="num font-semibold text-ink">
            {verified} of {runs}
          </span>{' '}
          runs passed Patchlane verification.{' '}
          {chalk.available ? (
            <>
              Chalk scored {scored != null && scored !== runs ? `${scored} of them` : 'every run'}, and the mean composite score was{' '}
              <span className="num font-semibold text-ink">{score(agg.meanComposite)}</span> out of 1.
            </>
          ) : (
            'Chalk didn’t score this run, so everything here comes from Patchlane verification only.'
          )}
        </p>
      </div>

      <CaseTable groups={groups} titles={titles} chalk={chalk} summary={summary} runs={runs} verified={verified} />

      {summary.failures?.length > 0 && (
        <div className="mt-10">
          <h3 className="text-[17px] font-bold text-ink">Runs that didn’t verify</h3>
          <ul className="mt-3 border-t border-line">
            {summary.failures.map((f) => (
              <li
                key={`${f.caseId}-${f.run}`}
                className="grid grid-cols-1 gap-1 border-b border-line py-3 sm:grid-cols-[18rem_minmax(0,1fr)] sm:gap-4"
              >
                <span className="text-[15px] text-ink">
                  {titles[f.caseId]?.title ?? f.caseId} <span className="text-muted">· run {f.run}</span>
                </span>
                <span className="text-[15px] text-body">{f.reason || f.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-14">
        <Scoring chalk={chalk} />
        <RunDetails data={data} chalk={chalk} />
      </div>
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
      <Icon className="size-[18px]" aria-label={label} />
    </span>
  )
}

function CaseTable({ groups, titles, chalk, summary, runs, verified }) {
  const cell = 'px-3 py-3 text-right text-[15px]'
  const hidden = groups.map((g) => {
    const hiddenRuns = g.runs.filter((r) => num(r.hidden_total) != null)
    return {
      passed: hiddenRuns.reduce((a, r) => a + (r.hidden_passed ?? 0), 0),
      total: hiddenRuns.reduce((a, r) => a + (r.hidden_total ?? 0), 0),
    }
  })
  const hpAll = hidden.reduce((a, h) => a + h.passed, 0)
  const htAll = hidden.reduce((a, h) => a + h.total, 0)
  const body = groups.map((g, i) => {
    const { passed: hp, total: ht } = hidden[i]
    const attacks = g.runs.map((r) => r.attacks_succeeded).filter((x) => num(x) != null)
    const tampered = g.runs.some((r) => r.tampering === true)
    const tamperKnown = g.runs.some((r) => r.tampering != null)
    const composite = mean(g.chalk.map((e) => e.composite))
    return (
      <tr key={g.id} className="border-b border-line">
        <th scope="row" className="py-3 pr-3 font-normal">
          {titles[g.id]?.title ? (
            <>
              <span className="block text-[15px] font-semibold text-ink">{titles[g.id].title}</span>
              <span className="block font-mono text-[12.5px] text-muted">{g.id}</span>
            </>
          ) : (
            <span className="block font-mono text-[14px] font-medium whitespace-nowrap text-ink">{g.id}</span>
          )}
        </th>
        <td className="px-3 py-3">
          <span className="flex gap-1">
            {g.runs.map((r) => (
              <RunMark key={r.run} row={r} />
            ))}
          </span>
        </td>
        <td className={`num ${cell} ${ht && hp === ht ? 'text-healthy' : 'text-ink'}`}>{ht ? `${hp}/${ht}` : '-'}</td>
        <td className={`num ${cell} ${attacks.some((a) => a > 0) ? 'text-incident' : 'text-ink'}`}>
          {!attacks.length ? (
            <span className="text-muted" title="This bug has no incident traffic to replay">
              n/a
            </span>
          ) : attacks.every((a) => a === 0) ? (
            'none'
          ) : (
            attacks.join(' · ')
          )}
        </td>
        <td className={`${cell} ${tampered ? 'text-incident' : 'text-ink'}`}>{tamperKnown ? (tampered ? 'yes' : 'none') : '-'}</td>
        <td className={`num ${cell} text-ink`}>{seconds(median(g.runs.map((r) => r.duration_s)))}</td>
        {chalk.available && <td className={`num ${cell} pr-0 font-semibold text-ink`}>{score(composite)}</td>}
      </tr>
    )
  })

  const tampering = num(summary.tampering)
  return (
    <div className="scroll-quiet mt-8 overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-left">
        <caption className="sr-only">Benchmark results for each seeded bug</caption>
        <thead>
          <tr className="border-b border-line-strong text-[13.5px] whitespace-nowrap text-muted">
            <th scope="col" className="py-2.5 pr-3 font-medium">
              Bug
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Runs
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              Held-out tests
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              Attacks after patch
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              Tampering
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              Median time
            </th>
            {chalk.available && (
              <th scope="col" className="py-2.5 pl-3 text-right font-medium">
                Chalk score
              </th>
            )}
          </tr>
        </thead>
        <tbody>{body}</tbody>
        <tfoot>
          <tr className="text-[15px] font-semibold text-ink">
            <th scope="row" className="pt-3 pr-3 text-left font-semibold">
              All runs
            </th>
            <td className="num px-3 pt-3">
              {verified}/{runs} verified
            </td>
            <td className={`num px-3 pt-3 text-right ${htAll && hpAll === htAll ? 'text-healthy' : ''}`}>
              {htAll ? `${hpAll}/${htAll}` : '-'}
            </td>
            <td className="num px-3 pt-3 text-right">
              {num(summary.attacksSucceeded) == null ? '-' : summary.attacksSucceeded === 0 ? 'none' : summary.attacksSucceeded}
            </td>
            <td className={`px-3 pt-3 text-right ${tampering ? 'text-incident' : ''}`}>
              {tampering == null ? '-' : tampering === 0 ? 'none' : tampering}
            </td>
            <td className="num px-3 pt-3 text-right">{seconds(num(summary.medianDurationS))}</td>
            {chalk.available && <td className="num pt-3 pl-3 text-right">{score(chalk.aggregate?.meanComposite)}</td>}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function Scoring({ chalk }) {
  const available = chalk?.available
  const means = chalk?.aggregate?.scorerMeans ?? {}
  return (
    <div className="min-w-0">
      <h3 className="text-[17px] font-bold text-ink">How Chalk scores a run</h3>
      <p className="mt-1 text-[15px] text-body">
        Five scorers, each from 0 to 1. The composite is their weighted sum.
      </p>
      <table className="mt-4 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line-strong text-[13.5px] text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              Scorer
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Weight
            </th>
            {available && (
              <th scope="col" className="py-2 pl-3 text-right font-medium">
                Mean
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {METHOD.map((m) => {
            const w = num(chalk?.weights?.[m.name]) ?? m.weight
            return (
              <tr key={m.name} className="border-b border-line">
                <th scope="row" className="py-2.5 pr-3 font-normal">
                  <span className="block text-[15px] font-semibold text-ink">{m.label}</span>
                  <span className="block text-[14px] text-muted">{m.measures}</span>
                </th>
                <td className="num px-3 py-2.5 text-right text-[15px] text-ink">{Math.round(w * 100)}%</td>
                {available && <td className="num py-2.5 pl-3 text-right text-[15px] font-semibold text-ink">{score(means[m.name])}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-4 text-[14px] leading-relaxed text-muted">
        A run counts as safe to review only when fixed, no regressions and no tampering all pass, whatever its weighted
        score.
      </p>
      {chalk && !available && chalk.reason && (
        <p className="mt-2 font-mono text-[13px] break-words text-muted">Chalk: {chalk.reason}</p>
      )}
      {available && chalk.aggregate?.rowsWithErrors > 0 && (
        <p className="mt-2 text-[14px] text-warning">
          {chalk.aggregate.rowsWithErrors} rows had scorer errors and have no composite score.
        </p>
      )}
    </div>
  )
}

function RunDetails({ data, chalk }) {
  const rows = [
    data.generatedAt && ['Run on', dateTime(data.generatedAt)],
    num(data.wallClockS) && ['Wall clock', seconds(data.wallClockS)],
    data.model && ['Droid model', data.model],
    chalk.available && chalk.evaluationName && ['Chalk evaluation', <Code key="n">{chalk.evaluationName}</Code>],
    chalk.available && chalk.evaluationId && ['Evaluation ID', <Code key="i">{chalk.evaluationId}</Code>],
    chalk.available && chalk.datasetName && ['Dataset', <Code key="d">{chalk.datasetName}</Code>],
    chalk.available && chalk.judgeModel && ['Root-cause judge', <Code key="j">{chalk.judgeModel}</Code>],
  ].filter(Boolean)

  return (
    <div className="min-w-0">
      <h3 className="text-[17px] font-bold text-ink">Run details</h3>
      <dl className="mt-4 border-t border-line-strong">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 border-b border-line py-2.5">
            <dt className="shrink-0 text-[14px] text-muted">{label}</dt>
            <dd className="min-w-0 text-right text-[14.5px] break-all text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {chalk.available && chalk.derived && <p className="mt-4 text-[14px] leading-relaxed text-muted">{chalk.derived}</p>}
    </div>
  )
}

function Code({ children }) {
  return <span className="font-mono text-[13px]">{children}</span>
}
