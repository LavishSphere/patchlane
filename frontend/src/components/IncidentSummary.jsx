import { clockTime, dateTime } from '../utils/format'
import { hasImpact } from '../utils/status'
import { Heading, Pill } from './ui'

export default function IncidentSummary({ incident }) {
  const firstSeen = incident.impact?.firstSeen
  const rows = [
    ['Severity', <Pill key="sev" tone="incident">{incident.severity}</Pill>],
    ['Service', incident.service],
    ['Endpoint', <code key="ep" className="font-mono text-[14.5px]">{incident.endpoint}</code>],
    firstSeen && ['First bad transfer', dateTime(firstSeen)],
    ['Detected', clockTime(incident.createdAt)],
    ['Case', <code key="case" className="font-mono text-[14.5px]">{incident.caseId}</code>],
  ].filter(Boolean)
  // The operator's choices when the incident was triggered. Older recordings don't have them.
  const chosen = [
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
