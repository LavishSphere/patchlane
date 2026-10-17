import { PackageCheck, Trash2, UserCheck } from 'lucide-react'
import { clockTime, shortId } from '../utils/format'
import { Heading } from './ui'

/** After approval: what happened, in order, with the time of each step. */
export default function Recovery({ incident, events }) {
  const packaged = events.find((e) => e.type === 'remediation.packaged')
  const sandboxes = [incident.agentSandbox, incident.verificationSandbox].filter(Boolean)
  const approval = incident.approval

  const steps = [
    approval?.receivedAt && {
      key: 'approval',
      Icon: UserCheck,
      title: approval.status === 'approved' ? 'Approved by operator' : 'Decision recorded',
      meta: approval.channel === 'dashboard' ? 'On the dashboard' : approval.channel,
      at: approval.receivedAt,
    },
    packaged && {
      key: 'package',
      Icon: PackageCheck,
      title: packaged.title,
      meta: packaged.metadata?.package ? <span className="font-mono text-[13px]">{packaged.metadata.package}</span> : null,
      at: packaged.timestamp,
    },
    ...sandboxes.map((s) => ({
      key: s.id,
      Icon: Trash2,
      title: `${s.role === 'agent' ? 'Agent sandbox' : 'Verification sandbox'} ${s.destroyedAt ? 'destroyed' : 'still running'}`,
      meta: <span className="font-mono text-[13px]">{shortId(s.id)}</span>,
      at: s.destroyedAt,
    })),
  ].filter(Boolean)

  return (
    <section id="recovery" aria-labelledby="recovery-title" className="min-w-0 scroll-mt-32">
      <Heading id="recovery-title">Recovery</Heading>
      <ol className="mt-4 border-t border-line">
        {steps.map(({ key, Icon, title, meta, at }) => (
          <li key={key} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-3 border-b border-line py-3.5">
            <span className="grid size-8 place-items-center rounded-[9px] border border-line bg-surface text-healthy">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[16px] leading-snug font-semibold text-ink">{title}</p>
              {meta && <p className="mt-0.5 text-[14px] text-muted">{meta}</p>}
            </div>
            <time className="num pt-1 text-[14px] text-muted" dateTime={at ?? undefined}>
              {at ? clockTime(at) : ''}
            </time>
          </li>
        ))}
      </ol>
    </section>
  )
}
