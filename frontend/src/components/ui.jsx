import { TONE_DOT } from '../utils/status'

const PILL = {
  healthy: 'bg-healthy-soft text-healthy',
  incident: 'bg-incident-soft text-incident',
  warning: 'bg-warning-soft text-warning',
  agent: 'bg-subtle text-agent',
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
      className={`inline-block size-2 shrink-0 rounded-full ${TONE_DOT[tone]} ${live ? 'pulse-dot' : ''} ${className}`}
    />
  )
}

export function Eyebrow({ children, className = '' }) {
  return <p className={`eyebrow ${className}`}>{children}</p>
}

export function CardHeader({ eyebrow, title, aside, id, className = '' }) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-x-6 gap-y-3 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 id={id} className="mt-1 text-[22px] leading-tight font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h2>
      </div>
      {aside && <div className="min-w-0">{aside}</div>}
    </div>
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
    <Tag className={`mx-auto w-full max-w-[1240px] px-4 sm:px-8 lg:px-10 ${className}`} {...rest}>
      {children}
    </Tag>
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
