import { clockTime, dateTime } from '../utils/format'
import { bugsOf, endpointsOf, hasImpact } from '../utils/status'
import { Heading, Pill } from './ui'

const code = (key, value) => (
  <code key={key} className="font-mono text-[14.5px]">
    {value}
  </code>
)

export default function IncidentSummary({ incident }) {
  const firstSeen = incident.impact?.firstSeen
  // Several bugs at once: incident.safeguard and variantLabel describe bug 1, extraBugs the rest.
  const bugs = bugsOf(incident)
  const many = bugs.length > 1
  const endpoints = endpointsOf(incident)
  const rows = [
    ['Severity', <Pill key="sev" tone="incident">{incident.severity}</Pill>],
    ['Service', incident.service],
    // Several endpoints take the full width so long paths don't run into the next column.
    many && endpoints.length > 1
      ? ['Endpoints', <span key="ep" className="flex flex-col items-end gap-0.5">{endpoints.map((ep) => code(ep, ep))}</span>, true]
      : ['Endpoint', code('ep', incident.endpoint)],
    firstSeen && ['First bad transfer', dateTime(firstSeen)],
    ['Detected', clockTime(incident.createdAt)],
    many
      ? ['Cases', <span key="case" className="flex flex-col items-end gap-0.5">{bugs.map((b, i) => code(b.caseId ?? i, b.caseId))}</span>]
      : ['Case', code('case', incident.caseId)],
  ].filter(Boolean)
  // The operator's choices when the incident was triggered. Older recordings don't have them.
  const chosen = many
    ? bugs
        .flatMap((b, i) => [
          [`Safeguard ${i + 1}`, b.safeguard],
          [`Chosen break ${i + 1}`, b.variantLabel],
        ])
        .filter(([, value]) => value)
    : [
        incident.safeguard && ['Safeguard', incident.safeguard],
        incident.variantLabel && ['Chosen break', incident.variantLabel],
      ].filter(Boolean)
  // The last half-width row fills the line when it would otherwise sit alone.
  const half = rows.map((row, i) => (row[2] ? -1 : i)).filter((i) => i >= 0)
  const wide = (i) => rows[i][2] || (chosen.length > 0 && half.length % 2 === 1 && i === half.at(-1))
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
