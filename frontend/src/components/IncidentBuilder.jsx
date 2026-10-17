import { ArrowDown, ChevronDown } from 'lucide-react'
import { useId } from 'react'
import { chalkForCase, chalkRunsText } from '../utils/chalk'

/**
 * Operator only: the incident the next trigger runs, built from fixed choices.
 * The safeguard is one of the seeded cases from GET /api/cases, and the break
 * is one of that case's variants. There is no free text anywhere.
 */
export default function IncidentBuilder({ operator, benchmark }) {
  const selectId = useId()
  const breakId = useId()
  const cases = operator?.cases ?? []
  if (!cases.length) return null

  const current = cases.find((c) => c.id === operator.caseId) ?? cases[0]
  const variants = Array.isArray(current.variants) ? current.variants : []
  const busy = operator.busy

  return (
    <div className="@container">
      <div className="border-t border-line">
        <Row label={<label htmlFor={selectId}>Safeguard to break</label>}>
          <SafeguardSelect
            id={selectId}
            cases={cases}
            current={current}
            disabled={busy}
            onChange={(id) => operator.chooseCase(id)}
          />
        </Row>
        {variants.length > 0 && (
          <Row label={<span id={breakId}>How it breaks</span>}>
            {variants.length === 1 ? (
              <p className="text-[16px] leading-snug text-ink @lg:pt-2.5">{variants[0].label}</p>
            ) : (
              <div role="radiogroup" aria-labelledby={breakId} className="flex flex-col @lg:pt-1">
                {variants.map((v) => (
                  <BreakOption
                    key={v.id}
                    name={breakId}
                    variant={v}
                    checked={v.id === operator.variantId}
                    disabled={busy}
                    onChange={() => operator.chooseVariant(v.id)}
                  />
                ))}
              </div>
            )}
          </Row>
        )}
        <Row label="Chalk benchmark">
          <ChalkCase benchmark={benchmark} caseId={current.id} variantId={operator.variantId} />
        </Row>
      </div>
    </div>
  )
}

/**
 * What Chalk measured for this case in the latest benchmark. The run about to
 * be triggered is checked by Patchlane verification only.
 */
function ChalkCase({ benchmark, caseId, variantId }) {
  const c = chalkForCase(benchmark, caseId)
  const text = 'text-[15px] leading-relaxed'
  if (!c) return <p className={`${text} text-muted @lg:pt-2.5`}>Loading the latest benchmark…</p>
  if (!c.available) return <p className={`${text} text-muted @lg:pt-2.5`}>Chalk evaluation unavailable</p>
  if (!c.runs) return <p className={`${text} text-muted @lg:pt-2.5`}>Chalk hasn’t scored this case yet.</p>

  const variant = variantId && variantId !== 'default'
  const gates = c.scorers.filter((s) => s.gate).map((s) => s.label)
  const reason = c.latest?.judgeReason

  return (
    <div className={`${text} text-body @lg:pt-2`}>
      {variant && <p className="text-ink">Chalk scored the original bug for this safeguard. This variant hasn’t been benchmarked.</p>}
      <p className={`num font-semibold text-ink ${variant ? 'mt-1' : ''}`}>{chalkRunsText(c)}</p>
      <ul className="mt-1 flex flex-wrap gap-x-3.5 gap-y-0.5 text-[14px] text-muted">
        {c.scorers.map((s) => (
          <li key={s.key} className="whitespace-nowrap">
            <span className={s.gate ? 'text-ink' : ''}>{s.label}</span>{' '}
            <span className="num">{s.weight == null ? '' : `${Math.round(s.weight * 100)}%`}</span>
          </li>
        ))}
      </ul>
      {gates.length > 0 && <p className="text-[14px] text-muted">Hard gates: {joinNames(gates)}.</p>}
      {reason && (
        <p className="mt-2">
          <span className="text-muted">Judge on run {c.latest.run}: </span>
          {reason}
        </p>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted">
        {c.evaluationId && (
          <span>
            Evaluation <span className="font-mono text-[13.5px] break-all text-ink">{c.evaluationId}</span>
          </span>
        )}
        <a href="#benchmark" className="link inline-flex items-center gap-1">
          Benchmark
          <ArrowDown className="size-3.5" aria-hidden="true" />
        </a>
      </p>
    </div>
  )
}

function joinNames(names) {
  const lower = names.map((n, i) => (i === 0 ? n : n.toLowerCase()))
  if (lower.length < 3) return lower.join(' and ')
  return `${lower.slice(0, -1).join(', ')} and ${lower.at(-1)}`
}

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-1 gap-2 border-b border-line py-4 @lg:grid-cols-[10rem_minmax(0,1fr)] @lg:gap-6">
      <div className="text-[15px] text-muted @lg:pt-2.5">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/**
 * A native <select> laid over a face that can wrap a full sentence. The select
 * stays transparent on top, so clicks, keyboard and screen readers all use it.
 */
function SafeguardSelect({ id, cases, current, disabled, onChange }) {
  return (
    <div
      className={`relative rounded-lg border border-line bg-surface transition-colors duration-200 has-[select:focus-visible]:border-accent has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-accent ${
        disabled ? 'opacity-50' : 'hover:border-accent'
      }`}
    >
      <div aria-hidden="true" className="py-2.5 pr-11 pl-3.5">
        <p className="text-[16px] leading-snug text-ink">{current.safeguard || current.title}</p>
        <p className="mt-1 flex flex-wrap gap-x-2 font-mono text-[13.5px] text-muted">
          <span>{current.severity}</span>
          <span className="text-faint">·</span>
          <span>{current.endpoint}</span>
        </p>
      </div>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      <select
        id={id}
        value={current.id}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="absolute inset-0 size-full cursor-pointer appearance-none rounded-lg text-[16px] opacity-0 disabled:cursor-not-allowed"
      >
        {cases.map((c) => (
          <option key={c.id} value={c.id}>
            {c.severity} · {c.safeguard || c.title}
          </option>
        ))}
      </select>
    </div>
  )
}

function BreakOption({ name, variant, checked, disabled, onChange }) {
  return (
    <label
      className={`flex items-start gap-3 py-1.5 text-[16px] leading-snug ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
    >
      <input
        type="radio"
        name={name}
        value={variant.id}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-[2px] size-[18px] shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed"
      />
      <span className={checked ? 'text-ink' : 'text-body'}>{variant.label}</span>
    </label>
  )
}
