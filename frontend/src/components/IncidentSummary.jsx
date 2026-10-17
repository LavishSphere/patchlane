import { clockTime, dateTime } from '../utils/format'
import { hasImpact } from '../utils/status'
import { Heading, Pill } from './ui'

const code = (key, value) => (
  <code key={key} className="font-mono text-[14.5px]">
    {value}
  </code>
)

export default function IncidentSummary({ incident }) {
  const firstSeen = incident.impact?.firstSeen
  // Two bugs at once: incident.safeguard and variantLabel describe the first, secondBug the second.
  const second = incident.secondBug
  const endpoints = [incident.endpoint, second?.endpoint].filter((ep, i, list) => ep && list.indexOf(ep) === i)
  const rows = [
    ['Severity', <Pill key="sev" tone="incident">{incident.severity}</Pill>],
    ['Service', incident.service],
    second && endpoints.length > 1
      ? ['Endpoints', <span key="ep" className="flex flex-col items-end gap-0.5">{endpoints.map((ep) => code(ep, ep))}</span>]
      : ['Endpoint', code('ep', incident.endpoint)],
    firstSeen && ['First bad transfer', dateTime(firstSeen)],
    ['Detected', clockTime(incident.createdAt)],
    second
      ? ['Cases', <span key="case" className="flex flex-col items-end gap-0.5">{[incident.caseId, second.caseId].map((id) => code(id, id))}</span>]
      : ['Case', code('case', incident.caseId)],
  ].filter(Boolean)
  // The operator's choices when the incident was triggered. Older recordings don't have them.
  const chosen = second
    ? [
        ['Safeguard 1', incident.safeguard],
        ['Chosen break 1', incident.variantLabel],
        ['Safeguard 2', second.safeguard],
        ['Chosen break 2', second.variantLabel],
      ].filter(([, value]) => value)
    : [
        incident.safeguard && ['Safeguard', incident.safeguard],
        incident.variantLabel && ['Chosen break', incident.variantLabel],
      ].filter(Boolean)
  const wide = (i) => chosen.length > 0 && rows.length % 2 === 1 && i === rows.length - 1
  const source = hasImpact(incident) ? 'The alert from the fraud rule, as it arrived' : 'The alert, as it arrived'

  return (
    <section id="incident" aria-labelledby="incident-title" className="min-w-0 scroll-mt-32">
      <Heading id="incident-title" aside={<span className="font-mono text-[14px]">{incident.id}</span>}>
        Incident
      </Heading>
      <p className="mt-2 text-[14px] text-muted">{source}</p>
      <blockquote className="mt-4 border-l-2 border-incident pl-4 text-[17px] leading-relaxed text-ink">{incident.alert}</blockquote>
      <dl className="mt-6 grid grid-cols-1 gap-x-10 border-t border-line sm:grid-cols-2">
        {rows.map(([label, value], i) => (
          <div
            key={label}
            className={`flex items-baseline justify-between gap-4 border-b border-line py-3 ${wide(i) ? 'sm:col-span-2' : ''}`}
          >
            <dt className="text-[15px] text-muted">{label}</dt>
            <dd className="text-right text-[15px] text-ink">{value}</dd>
          </div>
        ))}
        {chosen.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-6 border-b border-line py-3 sm:col-span-2">
            <dt className="shrink-0 text-[15px] text-muted">{label}</dt>
            <dd className="min-w-0 text-right text-[15px] leading-snug text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
