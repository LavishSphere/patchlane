// The Chalk benchmark for one seeded case, read from the latest benchmark
// (GET /api/benchmark/latest or the bundled copy). Live runs are never scored
// by Chalk; these numbers describe the benchmark runs of the same case.

const ORDER = ['fixed', 'no_regressions', 'no_tampering', 'correct_file', 'root_cause']

export const SCORER_LABELS = {
  fixed: 'Fixed',
  no_regressions: 'No regressions',
  no_tampering: 'No tampering',
  correct_file: 'Correct file',
  root_cause: 'Root cause',
}

const num = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : null)

/**
 * null while the benchmark is loading. { available: false } when there is no
 * Chalk evaluation to show. Otherwise the case's Chalk rows and the scoring setup.
 */
export function chalkForCase(benchmark, caseId) {
  if (!benchmark || benchmark.status === 'loading') return null
  const chalk = benchmark.data?.available ? benchmark.data.chalk : null
  if (!chalk?.available) return { available: false }

  const rows = (Array.isArray(chalk.rows) ? chalk.rows : [])
    .filter((r) => r.caseId === caseId)
    .sort((a, b) => (a.run ?? 0) - (b.run ?? 0))
  const composites = rows.map((r) => num(r.composite)).filter((v) => v != null)
  const latest = rows.at(-1) ?? null
  const weights = chalk.weights ?? {}
  const gate = new Set(Array.isArray(chalk.gate) ? chalk.gate : [])
  const keys = [...ORDER.filter((k) => k in weights), ...Object.keys(weights).filter((k) => !ORDER.includes(k))]

  return {
    available: true,
    evaluationId: chalk.evaluationId ?? null,
    judgeModel: chalk.judgeModel ?? null,
    runs: rows.length,
    scored: composites.length,
    composites,
    latest,
    scorers: keys.map((key) => ({
      key,
      label: SCORER_LABELS[key] ?? key,
      weight: num(weights[key]),
      gate: gate.has(key),
    })),
  }
}

/** "2 of 2 runs scored 1.00", or the scores one by one when they differ. */
export function chalkRunsText(c, { short = false } = {}) {
  if (!c?.runs) return null
  if (!c.scored) return short ? `${c.runs} runs, no composite score` : `${c.runs} runs, none with a composite score`
  const first = c.composites[0]
  if (c.composites.every((v) => v === first)) {
    return short ? `${c.scored}/${c.runs} runs at ${first.toFixed(2)}` : `${c.scored} of ${c.runs} runs scored ${first.toFixed(2)}`
  }
  const list = c.composites.map((v) => v.toFixed(2)).join(', ')
  return short ? `${c.runs} runs at ${list}` : `${c.runs} runs scored ${list}`
}
