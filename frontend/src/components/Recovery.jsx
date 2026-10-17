import { PackageCheck, Trash2, Undo2, UserCheck } from 'lucide-react'
import { clockTime, money, plural } from '../utils/format'
import { CardHeader } from './ui'

/** After approval: what Patchlane hands over. */
export default function Recovery({ incident, events }) {
  const packaged = events.find((e) => e.type === 'remediation.packaged')
  const impact = incident.impact ?? {}
  const customers = impact.affectedCustomers ?? []
  const sandboxes = [incident.agentSandbox, incident.verificationSandbox].filter(Boolean)
  const approval = incident.approval

  return (
    <section aria-labelledby="recovery-title" className="card">
      <CardHeader id="recovery-title" eyebrow="Recovery" title="Handed back to the humans" />

      <div className="mt-6 grid gap-6 md:grid-cols-3 md:gap-8">
        <Block icon={UserCheck} title={approval?.status === 'approved' ? 'Approved by operator' : 'Approval'}>
          {approval?.receivedAt ? `Recorded at ${clockTime(approval.receivedAt)} on the dashboard.` : 'No decision recorded.'}
          {packaged && (
            <span className="mt-3 flex items-start gap-2 text-ink">
              <PackageCheck className="mt-0.5 size-4 shrink-0 text-healthy" aria-hidden="true" />
              {packaged.title}
            </span>
          )}
        </Block>

        <Block icon={Undo2} title={`${plural(impact.unauthorizedTransfers ?? 0, 'transfer')} listed for reversal`}>
          <ul className="mt-1 space-y-1.5">
            {customers.map((c) => (
              <li key={c.customerId} className="flex justify-between gap-3">
                <span className="truncate text-ink">
                  {c.displayName} <span className="font-mono text-[13px] text-muted">{c.maskedAccount}</span>
                </span>
                <span className="num shrink-0 text-ink">{money(c.amountMovedCents)}</span>
              </li>
            ))}
          </ul>
          <span className="mt-3 block">Patchlane lists them. Reversing money stays a human decision.</span>
        </Block>

        <Block icon={Trash2} title={`${sandboxes.filter((s) => s.destroyedAt).length} of ${sandboxes.length} sandboxes destroyed`}>
          <ul className="mt-1 space-y-1.5">
            {sandboxes.map((s) => (
              <li key={s.id} className="flex justify-between gap-3">
                <span className="text-ink">{s.role === 'agent' ? 'Agent sandbox' : 'Verification sandbox'}</span>
                <span className="num shrink-0">{s.destroyedAt ? clockTime(s.destroyedAt) : 'still running'}</span>
              </li>
            ))}
          </ul>
          <span className="mt-3 block">Nothing the agent touched is left running.</span>
        </Block>
      </div>
    </section>
  )
}

function Block({ icon: Icon, title, children }) {
  return (
    <div className="min-w-0">
      <h3 className="flex items-center gap-2 text-[17px] font-semibold text-ink">
        <Icon className="size-[18px] text-healthy" aria-hidden="true" />
        {title}
      </h3>
      <div className="mt-2 text-[15px] leading-relaxed text-muted">{children}</div>
    </div>
  )
}
