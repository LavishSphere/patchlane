import { ArrowDown, Box, FlaskConical, ShieldCheck, Trash2, Wifi, WifiOff } from 'lucide-react'
import { useMemo } from 'react'
import { useNow } from '../state/clock'
import { diffStats, parseDiff } from '../utils/diff'
import { clockTime, duration, plural, shortId, toMs } from '../utils/format'
import { Dot, Heading, MetaList, Pill } from './ui'

const ROLE = {
  agent: {
    title: 'Agent sandbox',
    trust: 'Untrusted',
    blurb: 'Droid works here. The held-out tests are never copied in.',
    Icon: Box,
  },
  verification: {
    title: 'Verification sandbox',
    trust: 'Clean',
    blurb: 'Droid never has access. The held-out tests and the replay run here.',
    Icon: FlaskConical,
  },
}

/** Both Daytona sandboxes, with what crosses between them. */
export function SandboxPanel({ incident }) {
  const files = useMemo(() => parseDiff(incident?.diff), [incident?.diff])
  const stats = diffStats(files)
  const rejected = incident?.verification?.rejectedPaths ?? []
  const dropped = incident?.verification?.droppedAgentTests ?? []

  return (
    <section id="sandboxes" aria-labelledby="sandboxes-title" className="flex min-w-0 scroll-mt-32 flex-col">
      <Heading id="sandboxes-title">Sandboxes</Heading>
      <p className="mt-2 text-[15px] text-body">Each incident gets two Daytona sandboxes. Droid only works in the first.</p>

      <div className="mt-5">
        {incident?.agentSandbox ? (
          <SandboxCard sandbox={incident.agentSandbox} />
        ) : (
          <PendingSandbox role="agent" note={incident?.status === 'sandbox_creating' ? 'Creating…' : 'Not created yet'} />
        )}

        <div className="flex items-stretch gap-4 py-2 pl-[1.6rem]" role="group" aria-label="What crosses between the sandboxes">
          <div className="flex flex-col items-center" aria-hidden="true">
            <span className="w-px flex-1 bg-line-strong" />
            <ArrowDown className={`my-0.5 size-4 ${incident?.diff ? 'text-accent' : 'text-faint'}`} />
            <span className="w-px flex-1 bg-line-strong" />
          </div>
          <div className="min-w-0 py-1 text-[14px] leading-snug">
            <p className={incident?.diff ? 'font-semibold text-ink' : 'text-body'}>Only the source diff is copied across</p>
            {incident?.diff ? (
              <p className="mt-0.5 truncate text-muted">
                <span className="font-mono text-[13px]">{files.map((f) => f.newPath).join(', ') || 'no files'}</span>{' '}
                <span className="num font-mono text-[13px] whitespace-nowrap">
                  <span className="text-healthy">+{stats.additions}</span> <span className="text-incident">−{stats.deletions}</span>
                </span>
              </p>
            ) : (
              <p className="mt-0.5 text-muted">Patchlane takes it with git when Droid finishes. Tests, data and scripts stay behind.</p>
            )}
            {(rejected.length > 0 || dropped.length > 0) && (
              <p className="mt-1 text-warning">Rejected: {[...rejected, ...dropped].join(', ')}</p>
            )}
          </div>
        </div>

        {incident?.verificationSandbox ? (
          <SandboxCard sandbox={incident.verificationSandbox} />
        ) : (
          <PendingSandbox role="verification" note={incident?.status === 'verifying' ? 'Starting…' : 'Starts after Droid finishes'} />
        )}
      </div>
    </section>
  )
}

export default function SandboxCard({ sandbox }) {
  const now = useNow()
  const role = ROLE[sandbox.role] ?? ROLE.agent
  const destroyed = Boolean(sandbox.destroyedAt) || sandbox.state === 'destroyed'
  const created = toMs(sandbox.createdAt)
  const end = toMs(sandbox.destroyedAt) ?? now
  const uptime = created != null ? end - created : null
  const noNetwork = sandbox.networkPolicy === 'none'
  const { Icon } = role

  return (
    <article aria-label={`${role.title} ${sandbox.id}`} className="enter rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-[10px] border ${
              destroyed ? 'border-line bg-subtle text-muted' : 'border-line bg-canvas text-ink'
            }`}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[16px] leading-tight font-bold text-ink">{role.title}</h3>
            <p className="mt-0.5 truncate text-[14px] text-muted" title={sandbox.id}>
              {role.trust} · <span className="font-mono text-[13px]">{shortId(sandbox.id)}</span>
            </p>
          </div>
        </div>
        {destroyed ? (
          <Pill tone="muted">
            <Trash2 className="size-3.5" aria-hidden="true" />
            Destroyed
          </Pill>
        ) : (
          <Pill tone="healthy">
            <Dot tone="healthy" live />
            {sandbox.state === 'running' ? 'Running' : sandbox.state}
          </Pill>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3.5">
        <Stat label={destroyed ? 'Lifetime' : 'Uptime'} value={duration(uptime)} />
        <Stat label="Commands" value={sandbox.commandsExecuted} />
        <Stat
          label="Network"
          value={
            <span className={`inline-flex items-center gap-1.5 ${noNetwork ? 'text-healthy' : 'text-warning'}`}>
              {noNetwork ? <WifiOff className="size-4" aria-hidden="true" /> : <Wifi className="size-4" aria-hidden="true" />}
              {noNetwork ? 'none' : sandbox.networkPolicy}
            </span>
          }
        />
      </dl>

      <p className="mt-3 text-[14px] leading-snug text-body">{role.blurb}</p>

      <MetaList
        className="mt-1.5 text-[13px] text-muted"
        items={[
          sandbox.role === 'agent' && (
            <span key="b" className="inline-flex items-center gap-1">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              {plural(sandbox.hostToolsBlocked ?? 0, 'host tool call')} blocked
            </span>
          ),
          <span key="c">Created {clockTime(sandbox.createdAt)}</span>,
          destroyed && <span key="d">Destroyed {clockTime(sandbox.destroyedAt)}</span>,
        ]}
      />
    </article>
  )
}

function Stat({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="num mt-0.5 truncate text-[19px] leading-tight font-bold text-ink">{value}</dd>
    </div>
  )
}

function PendingSandbox({ role, note }) {
  const r = ROLE[role]
  const { Icon } = r
  return (
    <article aria-label={`${r.title}: ${note}`} className="rounded-xl border border-dashed border-line-strong p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line text-muted">
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[16px] leading-tight font-bold text-ink">{r.title}</h3>
          <p className="mt-0.5 text-[14px] text-muted">
            {r.trust} · {note}
          </p>
          <p className="mt-2 text-[14px] leading-snug text-body">{r.blurb}</p>
        </div>
      </div>
    </article>
  )
}
