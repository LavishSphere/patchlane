import { clockTime, dateTime } from '../utils/format'
import { Heading, Pill } from './ui'

export default function IncidentSummary({ incident }) {
  const rows = [
    ['Severity', <Pill key="sev" tone="incident">{incident.severity}</Pill>],
    ['Service', incident.service],
    ['Endpoint', <code key="ep" className="font-mono text-[14.5px]">{incident.endpoint}</code>],
    ['First bad transfer', incident.impact?.firstSeen ? dateTime(incident.impact.firstSeen) : '–'],
    ['Detected', clockTime(incident.createdAt)],
    ['Case', <code key="case" className="font-mono text-[14.5px]">{incident.caseId}</code>],
  ]

  return (
    <section id="incident" aria-labelledby="incident-title" className="min-w-0 scroll-mt-32">
      <Heading id="incident-title" aside={<span className="font-mono text-[14px]">{incident.id}</span>}>
        Incident
      </Heading>
      <p className="mt-2 text-[14px] text-muted">The alert from the fraud rule, as it arrived</p>
      <blockquote className="mt-4 border-l-2 border-incident pl-4 text-[17px] leading-relaxed text-ink">{incident.alert}</blockquote>
      <dl className="mt-6 grid grid-cols-1 gap-x-10 border-t border-line sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 border-b border-line py-3">
            <dt className="text-[15px] text-muted">{label}</dt>
            <dd className="text-right text-[15px] text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
