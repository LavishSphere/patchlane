import { TONE_DOT, TONE_TEXT } from '../utils/status'

const PILL = {
  healthy: 'bg-healthy-soft text-healthy',
  incident: 'bg-incident-soft text-incident',
  warning: 'bg-warning-soft text-warning',
  agent: 'bg-accent-soft text-accent',
  muted: 'bg-subtle text-muted',
  ink: 'bg-ink text-canvas',
}

export function Pill({ tone = 'muted', className = '', children, ...rest }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] leading-none font-medium whitespace-nowrap ${PILL[tone]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  )
}

export function Dot({ tone = 'muted', live = false, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-2 shrink-0 rounded-full ${TONE_DOT[tone]} ${TONE_TEXT[tone]} ${live ? 'pulse-dot' : ''} ${className}`}
    />
  )
}

/** Fades content in when it first appears (disabled by prefers-reduced-motion). */
export function Enter({ as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag className={`enter ${className}`} {...rest}>
      {children}
    </Tag>
  )
}

export function Container({ as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag className={`mx-auto w-full max-w-[1128px] px-4 sm:px-6 ${className}`} {...rest}>
      {children}
    </Tag>
  )
}

/** A plain section heading, khayrul.com style: bold, sentence case, no label above it. */
export function Heading({ id, children, aside, className = '' }) {
  return (
    <div className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 ${className}`}>
      <h2 id={id} className="text-[24px] leading-tight font-bold tracking-[-0.015em] text-ink sm:text-[26px]">
        {children}
      </h2>
      {aside && <div className="min-w-0 text-[14px] text-muted">{aside}</div>}
    </div>
  )
}

export function Mono({ className = '', children }) {
  return <span className={`font-mono text-[0.92em] ${className}`}>{children}</span>
}

/**
 * Inline facts separated by middle dots. Dots that would start a wrapped line
 * are clipped, so a wrapped list never begins or ends with a stray separator.
 */
export function MetaList({ items, className = '', gap = 'gap-y-1' }) {
  const list = items.filter(Boolean)
  return (
    <div className={`overflow-hidden ${className}`}>
      <ul className={`-ml-5 flex flex-wrap items-center ${gap}`}>
        {list.map((item, i) => (
          <li
            key={i}
            className="relative flex min-w-0 items-center pl-5 before:absolute before:left-[0.5rem] before:text-faint before:content-['·']"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * A row of figures in one thin box, divided by hairlines.
 * items: [{ label, value, note?, tone? }]
 */
export function StatStrip({ items, className = '', cols }) {
  const list = items.filter(Boolean)
  const grid = cols ?? (list.length === 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3')
  return (
    <dl className={`grid overflow-hidden rounded-xl border border-line bg-surface ${grid} ${className}`}>
      {list.map((f) => (
        <div key={f.label} className="-mt-px -ml-px flex min-w-0 flex-col border-t border-l border-line px-4 py-4 sm:px-5">
          <dt className="order-2 mt-1.5 text-[13px] leading-snug text-muted sm:text-[14px]">{f.label}</dt>
          <dd
            className={`num order-1 text-[24px] leading-none font-bold tracking-[-0.02em] sm:text-[30px] ${f.tone ?? 'text-ink'}`}
          >
            {f.value}
          </dd>
          {f.note && <dd className="order-3 mt-0.5 text-[12.5px] leading-snug text-faint sm:text-[13px]">{f.note}</dd>}
        </div>
      ))}
    </dl>
  )
}
