import { money, plural } from '../utils/format'
import { CardHeader } from './ui'

export default function ImpactSummary({ incident, title = 'Who lost money', eyebrow = 'Impact' }) {
  const impact = incident.impact ?? {}
  const customers = impact.affectedCustomers ?? []

  return (
    <section aria-labelledby="impact-title" className="card">
      <CardHeader id="impact-title" eyebrow={eyebrow} title={title} />

      <dl className="mt-5 grid grid-cols-3 gap-4">
        <Figure label="Unauthorized transfers" value={impact.unauthorizedTransfers ?? '—'} tone="text-incident" />
        <Figure label="Moved" value={money(impact.amountMovedCents)} />
        <Figure label="Customers" value={customers.length} />
      </dl>

      {customers.length > 0 && (
        <ul className="mt-5 border-t border-line">
          {customers.map((c) => (
            <li key={c.customerId} className="flex items-center justify-between gap-4 border-b border-line/70 py-3">
              <div className="min-w-0">
                <p className="truncate text-[16px] text-ink">{c.displayName}</p>
                <p className="font-mono text-[13px] text-muted">{c.maskedAccount}</p>
              </div>
              <p className="num shrink-0 text-[17px] font-medium text-ink">{money(c.amountMovedCents)}</p>
            </li>
          ))}
        </ul>
      )}

      {impact.legitTransfersInWindow > 0 && (
        <p className="mt-4 text-[14px] leading-relaxed text-muted">
          {plural(impact.legitTransfersInWindow, 'legitimate transfer')} went through in the same window. A fix has to keep them
          working.
        </p>
      )}
    </section>
  )
}

function Figure({ label, value, tone = 'text-ink' }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] leading-snug text-muted">{label}</dt>
      <dd className={`num mt-1 text-[22px] leading-none font-semibold sm:text-[26px] ${tone}`}>{value}</dd>
    </div>
  )
}
