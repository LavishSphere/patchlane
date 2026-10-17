import { ArrowRight, Check, CircleCheck, CircleX, Hand, X } from 'lucide-react'
import { clockTime } from '../utils/format'
import { MetaList } from './ui'

/**
 * The human checkpoint. Live operators get Approve / Reject. Replay pauses here
 * and offers to continue. Once decided, it shows the recorded decision and time.
 */
export default function ApprovalStatus({ incident, mode, replay, operator }) {
  const approval = incident?.approval
  const decided = approval && approval.status !== 'pending'

  if (decided) {
    const approved = approval.status === 'approved'
    return (
      <div className="flex items-start gap-2 text-[16px] text-ink">
        {approved ? (
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-healthy" aria-hidden="true" />
        ) : (
          <CircleX className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        )}
        <MetaList
          items={[
            <span key="who" className="font-semibold">
              {approved ? 'Approved by operator' : 'Rejected by operator'}
            </span>,
            <span key="at" className="num text-muted">
              {clockTime(approval.receivedAt)}
            </span>,
            <span key="ch" className="text-muted">
              {approval.channel === 'dashboard' ? 'on the dashboard' : approval.channel}
            </span>,
          ]}
        />
      </div>
    )
  }

  if (incident?.status !== 'awaiting_approval') return null

  if (mode === 'live' && operator) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" onClick={operator.approve} disabled={operator.busy}>
            <Check className="size-[18px]" aria-hidden="true" />
            Approve patch
          </button>
          <button type="button" className="btn-secondary" onClick={operator.reject} disabled={operator.busy}>
            <X className="size-[18px]" aria-hidden="true" />
            Reject
          </button>
        </div>
        <p className="max-w-[36rem] text-[14px] text-muted">
          Either choice destroys both sandboxes. Approving also packages the patch and lists the unauthorized transfers for
          reversal.
        </p>
      </div>
    )
  }

  if (mode === 'replay' && replay?.checkpoint === 'awaiting_approval') {
    return (
      <div className="flex flex-col gap-3">
        <div>
          <button type="button" className="btn-primary" onClick={replay.play}>
            Replay the approval
            <ArrowRight className="size-[18px]" aria-hidden="true" />
          </button>
        </div>
        <p className="text-[14px] text-muted">The recording is paused at the operator’s decision.</p>
      </div>
    )
  }

  return (
    <p className="flex items-center gap-2 text-[16px] text-muted">
      <Hand className="size-5" aria-hidden="true" />
      Waiting for the operator.
    </p>
  )
}
