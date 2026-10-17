import { ArrowDown, ChevronDown } from 'lucide-react'
import { useId } from 'react'
import { chalkForCase, chalkRunsText } from '../utils/chalk'

/**
 * Operator only: the incident the next trigger runs, built from fixed choices.
 * The safeguard is one of the seeded cases from GET /api/cases, and the break
 * is one of that case's variants. A second safeguard can be broken in the same
 * incident when GET /api/pairs allows the combination. There is no free text anywhere.
 */
export default function IncidentBuilder({ operator, benchmark }) {
  const selectId = useId()
  const breakId = useId()
  const secondSelectId = useId()
  const secondBreakId = useId()
  const cases = operator?.cases ?? []
  if (!cases.length) return null

  const current = cases.find((c) => c.id === operator.caseId) ?? cases[0]
  const variants = Array.isArray(current.variants) ? current.variants : []
  const busy = operator.busy
  // null without a pair list, and then the second bug isn't offered at all.
  const pairing = operator.pairing
  const second = pairing?.second ? pairing.options.find((o) => o.case.id === pairing.second.caseId) : null

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
            <Breaks
              labelId={breakId}
              variants={variants}
              value={operator.variantId}
              disabled={busy}
              onChange={(id) => operator.chooseVariant(id)}
            />
          </Row>
        )}
        {pairing && (
          <Row label="Second bug">
            <div className="@lg:pt-1">
              <Check
                checked={Boolean(second)}
                disabled={busy || pairing.options.length === 0}
                onChange={(on) => operator.setSecond(on)}
              >
                Break a second safeguard too
              </Check>
              {pairing.options.length === 0 && (
                <p className="mt-1 text-[15px] leading-relaxed text-muted">
                  No other safeguard can be broken together with this break.
                </p>
              )}
            </div>
          </Row>
        )}
        {second && (
          <>
            <Row label={<label htmlFor={secondSelectId}>Second safeguard</label>}>
              <SafeguardSelect
                id={secondSelectId}
                cases={pairing.options.map((o) => o.case)}
                current={second.case}
                disabled={busy}
                onChange={(id) => operator.chooseSecondCase(id)}
              />
            </Row>
            <Row
              label={
                <span id={secondBreakId}>
                  How it breaks<span className="sr-only"> (second safeguard)</span>
                </span>
              }
            >
              <Breaks
                labelId={secondBreakId}
                variants={second.variants}
                value={pairing.second.variantId}
                disabled={busy}
                onChange={(id) => operator.chooseSecondVariant(id)}
              />
            </Row>
          </>
        )}
        <Row label="Chalk benchmark">
          {second ? (
            <ChalkPair
              benchmark={benchmark}
              sides={[
                { caseId: current.id, label: current.safeguard || current.title },
                { caseId: second.case.id, label: second.case.safeguard || second.case.title },
              ]}
            />
          ) : (
            <ChalkCase benchmark={benchmark} caseId={current.id} variantId={operator.variantId} />
          )}
        </Row>
      </div>
    </div>
  )
}

/** The breaks to pick from: plain text when there is one, radios otherwise. */
function Breaks({ labelId, variants, value, disabled, onChange }) {
  if (variants.length === 1) return <p className="text-[16px] leading-snug text-ink @lg:pt-2.5">{variants[0].label}</p>
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="flex flex-col @lg:pt-1">
      {variants.map((v) => (
        <BreakOption
          key={v.id}
          name={labelId}
          variant={v}
          checked={v.id === value}
          disabled={disabled}
          onChange={() => onChange(v.id)}
        />
      ))}
    </div>
  )
}

/**
 * Chalk for two bugs at once. Chalk has only scored each case's original bug
 * by itself, so each case gets its own line and no combined number is shown.
 */
function ChalkPair({ benchmark, sides }) {
  const text = 'text-[15px] leading-relaxed'
  const list = sides.map((side) => ({ ...side, chalk: chalkForCase(benchmark, side.caseId) }))
  if (list.some((side) => !side.chalk)) return <p className={`${text} text-muted @lg:pt-2.5`}>Loading the latest benchmark…</p>
  if (!list[0].chalk.available) return <p className={`${text} text-muted @lg:pt-2.5`}>Chalk evaluation unavailable</p>
  const evaluationId = list[0].chalk.evaluationId

  return (
    <div className={`${text} text-body @lg:pt-2`}>
      <p className="text-ink">Chalk hasn’t scored this combination. It scored each safeguard’s original bug on its own:</p>
      <ul className="mt-2 border-t border-line">
        {list.map((side) => (
          <li
            key={side.caseId}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-line py-1.5"
          >
            <span className="min-w-0 leading-snug">{side.label}</span>
            <span className={`num text-right whitespace-nowrap ${side.chalk.runs ? 'font-semibold text-ink' : 'text-muted'}`}>
              {side.chalk.runs ? chalkRunsText(side.chalk, { short: true }) : 'not scored yet'}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted">
        {evaluationId && (
          <span>
            Evaluation <span className="font-mono text-[13.5px] break-all text-ink">{evaluationId}</span>
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

function Check({ checked, disabled, onChange, children }) {
  return (
    <label
      className={`flex items-start gap-3 py-1.5 text-[16px] leading-snug ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-[2px] size-[18px] shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed"
      />
      <span className="text-ink">{children}</span>
    </label>
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
