import { ArrowDown, CircleCheck, CircleX, LoaderCircle } from 'lucide-react'
import { useId } from 'react'
import { asSentence } from '../state/choice'
import { chalkForCase, chalkRunsText } from '../utils/chalk'

/**
 * Operator only: the scenario the next trigger runs. Every seeded case from
 * GET /api/cases is a row, named by the safeguard it breaks. Ticking a row adds
 * that bug to the scenario, up to three, and shows how it can break. There is
 * no free text anywhere. `action` is the trigger button, kept next to the
 * scenario summary so it stays in reach below a long list.
 */
export default function IncidentBuilder({ operator, benchmark, action }) {
  const cases = operator?.cases ?? []
  if (!cases.length) return null

  const scenario = operator.scenario
  const full = scenario.length >= operator.max
  const position = (id) => scenario.findIndex((b) => b.caseId === id) + 1

  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-x-12 gap-y-6 @3xl:grid-cols-[minmax(0,1fr)_22rem] @3xl:items-start">
        <fieldset className="min-w-0">
          <legend className="text-[18px] font-semibold text-ink">Safeguards to break</legend>
          <p className={`mt-1 text-[15px] leading-relaxed ${full ? 'text-ink' : 'text-muted'}`} aria-live="polite">
            {full ? 'Up to three safeguards per scenario.' : 'Tick up to three. Each one you tick adds its bug to the incident.'}
          </p>
          <ul className="mt-3 border-t border-line">
            {cases.map((c) => {
              const at = position(c.id)
              return (
                <SafeguardRow
                  key={c.id}
                  item={c}
                  position={at}
                  variantId={at ? scenario[at - 1].variantId : null}
                  disabled={operator.busy || (!at && full)}
                  onToggle={(on) => operator.toggle(c.id, on)}
                  onVariant={(id) => operator.chooseVariant(c.id, id)}
                />
              )
            })}
          </ul>
        </fieldset>

        {/* Wide: one sticky column beside the list. Narrow: the wrapper steps aside (display: contents)
            so the status line and trigger can stick to the bottom of the screen over the whole list. */}
        <div className="contents @3xl:sticky @3xl:top-24 @3xl:block @3xl:min-w-0">
          <Summary operator={operator} benchmark={benchmark} />
          <div className="sticky bottom-0 z-10 -mx-1 -mt-2 border-t border-line bg-canvas px-1 pt-3 pb-4 @3xl:static @3xl:mx-0 @3xl:mt-4 @3xl:px-0 @3xl:pb-0">
            <ScenarioStatus check={operator.check} />
            {action && <div className="mt-3">{action}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

function SafeguardRow({ item, position, variantId, disabled, onToggle, onVariant }) {
  const metaId = useId()
  const breakId = useId()
  const ticked = position > 0
  const variants = Array.isArray(item.variants) ? item.variants : []

  return (
    <li className="border-b border-line">
      <label className={`flex items-start gap-3 py-3 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          checked={ticked}
          disabled={disabled}
          onChange={(e) => onToggle(e.target.checked)}
          aria-describedby={metaId}
          className="mt-[3px] size-[18px] shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed"
        />
        <span className="min-w-0 flex-1">
          <span className={`block text-[16px] leading-snug ${ticked ? 'font-medium text-ink' : 'text-body'}`}>
            {item.safeguard || item.title}
          </span>
          {/* A dot that would start a wrapped line is clipped, as in MetaList. */}
          <span id={metaId} className="mt-1 block overflow-hidden font-mono text-[14px] leading-snug text-muted">
            <span className="-ml-5 flex flex-wrap">
              <span className="pl-5">{item.severity}</span>
              <span className="relative min-w-0 pl-5 wrap-anywhere before:absolute before:left-1.5 before:text-faint before:content-['·']">
                {item.endpoint}
              </span>
            </span>
          </span>
        </span>
        {ticked && <span className="num shrink-0 pt-px text-[14px] font-medium text-accent">Bug {position}</span>}
      </label>
      {ticked && variants.length > 0 && (
        <div className="pb-3 pl-[30px]">
          <p id={breakId} className="text-[14px] text-muted">
            How it breaks
          </p>
          <Breaks labelId={breakId} variants={variants} value={variantId} disabled={disabled} onChange={onVariant} />
        </div>
      )}
    </li>
  )
}

/** The breaks to pick from: plain text when there is one, radios otherwise. */
function Breaks({ labelId, variants, value, disabled, onChange }) {
  if (variants.length === 1) return <p className="mt-1 text-[16px] leading-snug text-ink">{variants[0].label}</p>
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="mt-0.5 flex flex-col">
      {variants.map((v) => (
        <label
          key={v.id}
          className={`flex items-start gap-3 py-1 text-[16px] leading-snug ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
        >
          <input
            type="radio"
            name={labelId}
            value={v.id}
            checked={v.id === value}
            disabled={disabled}
            onChange={() => onChange(v.id)}
            className="mt-[2px] size-[18px] shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed"
          />
          <span className={v.id === value ? 'text-ink' : 'text-body'}>{v.label}</span>
        </label>
      ))}
    </div>
  )
}

/** The ticked bugs in order, each with its break and what Chalk measured for that case. */
function Summary({ operator, benchmark }) {
  const bugs = operator.scenario
    .map((b) => {
      const c = operator.cases.find((x) => x.id === b.caseId)
      if (!c) return null
      const variant = (c.variants ?? []).find((v) => v.id === b.variantId)
      return { ...b, case: c, label: variant?.label ?? null }
    })
    .filter(Boolean)
  const evaluationId = bugs.map((b) => chalkForCase(benchmark, b.caseId)).find((c) => c?.available)?.evaluationId

  return (
    <section aria-label="Scenario">
      <p className="text-[18px] font-semibold text-ink">Scenario</p>
      {bugs.length > 0 && (
        <ol className="mt-3 border-t border-line">
          {bugs.map((b, i) => (
            <li key={b.caseId} className="grid grid-cols-[3.25rem_minmax(0,1fr)] border-b border-line py-2.5">
              <span className="num pt-px text-[14px] text-muted">Bug {i + 1}</span>
              <div className="min-w-0">
                <p className="text-[16px] leading-snug text-ink">{b.case.safeguard || b.case.title}</p>
                {b.label && <p className="mt-0.5 text-[15px] leading-snug text-body">{b.label}</p>}
                <p className="mt-1 text-[14px] leading-snug text-muted">{chalkLine(benchmark, b)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {bugs.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted">
          {bugs.length > 1 && <span>Chalk hasn’t scored this combination.</span>}
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
      )}
    </section>
  )
}

/** One compact line from the latest benchmark. Chalk scores benchmark runs of each case's original bug. */
function chalkLine(benchmark, bug) {
  const c = chalkForCase(benchmark, bug.caseId)
  if (!c) return 'Loading the latest benchmark…'
  if (!c.available) return 'Chalk evaluation unavailable'
  if (!c.runs) return 'Chalk hasn’t scored this case yet'
  const runs = chalkRunsText(c, { short: true })
  return bug.variantId && bug.variantId !== 'default' ? `Chalk, original bug only: ${runs}` : `Chalk benchmark: ${runs}`
}

/** One plain line: whether the ticked bugs can run together, from the scenario check. */
export function ScenarioStatus({ check }) {
  const line = 'flex items-start gap-2 text-[16px] leading-snug'
  if (check.state === 'empty') return <p className={`${line} text-muted`}>Tick at least one safeguard to trigger an incident.</p>
  if (check.state === 'checking') {
    return (
      <p className={`${line} text-muted`} role="status">
        <LoaderCircle className="spin mt-[3px] size-4 shrink-0" aria-hidden="true" />
        Checking this scenario…
      </p>
    )
  }
  if (check.state === 'refused') {
    const reason = asSentence(check.reason) || 'The server refused this combination.'
    return (
      <p className={`${line} text-incident`} role="status">
        <CircleX className="mt-[3px] size-4 shrink-0" aria-hidden="true" />
        <span>
          {reason} <span className="text-ink">Choose a different break or safeguard.</span>
        </span>
      </p>
    )
  }
  if (check.state === 'unknown') {
    return (
      <p className={`${line} text-muted`} role="status">
        The scenario check didn’t answer. The server checks it again when you trigger.
      </p>
    )
  }
  return (
    <p className={`${line} text-healthy`} role="status">
      <CircleCheck className="mt-[3px] size-4 shrink-0" aria-hidden="true" />
      This scenario can run.
    </p>
  )
}
