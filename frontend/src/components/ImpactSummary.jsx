import { money, plural } from '../utils/format'
import { Heading } from './ui'

/** Who lost money, from incident.impact. After approval, the same list is the reversal list. */
export default function ImpactSummary({ incident, reversal = false }) {
  const impact = incident.impact ?? {}
  const customers = impact.affectedCustomers ?? []
  const transfers = impact.unauthorizedTransfers

  return (
    <section id="accounts" aria-labelledby="impact-title" className="min-w-0 scroll-mt-32">
      <Heading id="impact-title">{reversal ? 'Transfers to reverse' : 'Affected accounts'}</Heading>
      {typeof transfers === 'number' && (
        <p className="mt-2 text-[15px] leading-relaxed text-body">
          <span className="num font-semibold text-incident">{plural(transfers, 'unauthorized transfer')}</span> moved{' '}
          <span className="num font-semibold text-ink">{money(impact.amountMovedCents)}</span> out of{' '}
          {customers.length === 1 ? '1 customer’s account' : `${customers.length} customers’ accounts`}.
        </p>
      )}

      {customers.length > 0 && (
        <ul className="mt-4 border-t border-line">
          {customers.map((c) => (
            <li key={c.customerId} className="flex items-baseline justify-between gap-4 border-b border-line py-3">
              <div className="min-w-0">
                <p className="truncate text-[16px] font-semibold text-ink">{c.displayName}</p>
                <p className="font-mono text-[13px] text-muted">{c.maskedAccount}</p>
              </div>
              <p className="num shrink-0 text-[16px] font-semibold text-ink">{money(c.amountMovedCents)}</p>
            </li>
          ))}
        </ul>
      )}

      {reversal ? (
        <p className="mt-4 text-[14px] leading-relaxed text-muted">
          Patchlane put these in the patch package as reversal candidates. Someone at the bank decides on each reversal.
        </p>
      ) : (
        impact.legitTransfersInWindow > 0 && (
          <p className="mt-4 text-[14px] leading-relaxed text-muted">
            {plural(impact.legitTransfersInWindow, 'legitimate transfer')} went through in the same window. Verification replays
            them too, to check that the patch doesn’t block any.
          </p>
        )
      )}
    </section>
  )
}
