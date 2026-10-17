import { clockTime, dateTime } from '../utils/format'
import { CardHeader, Pill } from './ui'

export default function IncidentSummary({ incident }) {
  const rows = [
    ['Severity', <Pill key="sev" tone="incident">{incident.severity}</Pill>],
    ['Service', incident.service],
    ['Endpoint', <code key="ep" className="font-mono text-[15px]">{incident.endpoint}</code>],
    ['First bad transfer', incident.impact?.firstSeen ? dateTime(incident.impact.firstSeen) : '—'],
    ['Detected', clockTime(incident.createdAt)],
    ['Case', <code key="case" className="font-mono text-[15px]">{incident.caseId}</code>],
  ]

  return (
    <section aria-labelledby="incident-title" className="card">
      <CardHeader id="incident-title" eyebrow={`Incident ${incident.id}`} title="What the fraud rule saw" />
      <blockquote className="mt-4 border-l-2 border-incident/60 pl-4 text-[17px] leading-relaxed text-ink">
        {incident.alert}
      </blockquote>
      <dl className="mt-6 grid grid-cols-1 gap-x-8 border-t border-line sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 border-b border-line/70 py-3">
            <dt className="text-[15px] text-muted">{label}</dt>
            <dd className="text-right text-[16px] text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
