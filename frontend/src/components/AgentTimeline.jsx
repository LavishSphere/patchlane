import {
  Ban,
  Box,
  ChevronRight,
  CircleCheck,
  CircleX,
  FileCode,
  FilePen,
  Files,
  FolderOpen,
  GitCompare,
  Hand,
  MessageSquareText,
  PackageCheck,
  ScanSearch,
  Search,
  ShieldCheck,
  Siren,
  SquareTerminal,
  Trash2,
  TriangleAlert,
  UserCheck,
  Wrench,
  Bug,
  Sparkles,
  Circle,
} from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { shortId, toMs } from '../utils/format'
import { buildTimeline, timelineCounts } from '../utils/timeline'
import { CardHeader, MetaList } from './ui'

const ICON = {
  alert: Siren,
  sandbox: Box,
  upload: FolderOpen,
  exploit: Bug,
  isolation: ShieldCheck,
  droid: Sparkles,
  message: MessageSquareText,
  command: SquareTerminal,
  read: FileCode,
  write: FilePen,
  search: Search,
  diff: GitCompare,
  list: Files,
  tool: Wrench,
  blocked: Ban,
  finding: ScanSearch,
  verify: ShieldCheck,
  guard: ShieldCheck,
  'guard-warn': TriangleAlert,
  passed: CircleCheck,
  failed: CircleX,
  approval: Hand,
  approved: UserCheck,
  package: PackageCheck,
  destroyed: Trash2,
  resolved: CircleCheck,
  error: TriangleAlert,
  other: Circle,
}

// Icon chip styles. Milestones get color; routine work stays quiet.
const CHIP = {
  alert: 'bg-incident text-white border-incident',
  exploit: 'bg-incident-soft text-incident border-incident/20',
  write: 'bg-ink text-white border-ink',
  finding: 'bg-ink text-white border-ink',
  passed: 'bg-healthy text-white border-healthy',
  resolved: 'bg-healthy text-white border-healthy',
  failed: 'bg-incident text-white border-incident',
  blocked: 'bg-warning-soft text-warning border-warning/30',
  error: 'bg-warning-soft text-warning border-warning/30',
  'guard-warn': 'bg-warning-soft text-warning border-warning/30',
  approved: 'bg-healthy-soft text-healthy border-healthy/20',
  destroyed: 'bg-subtle text-muted border-line',
}

function offset(ms) {
  if (ms == null || Number.isNaN(ms)) return ''
  const s = Math.max(0, ms / 1000)
  if (s < 60) return `+${s.toFixed(s < 10 ? 1 : 0)}s`
  return `+${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export default function AgentTimeline({ incident, events }) {
  const rows = useMemo(() => buildTimeline(events), [events])
  const counts = useMemo(() => timelineCounts(events), [events])
  const start = toMs(incident?.createdAt) ?? toMs(events[0]?.timestamp)
  const list = useRef(null)
  const stick = useRef(true)

  // Follow new rows unless the reader has scrolled up.
  useEffect(() => {
    const el = list.current
    if (!el || !stick.current) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' })
  }, [rows.length])

  const hostToolsOff = counts.isolation && Array.isArray(counts.isolation.hostToolsEnabled) && counts.isolation.hostToolsEnabled.length === 0
  const blocked = incident?.agentSandbox?.hostToolsBlocked ?? counts.blocked

  return (
    <section aria-labelledby="timeline-title" className="card flex min-h-0 flex-col p-0">
      <div className="border-b border-line px-5 py-4 sm:px-6 sm:py-5">
        <CardHeader
          id="timeline-title"
          eyebrow="Factory Droid · the engineer"
          title="Investigation timeline"
          aside={
            <dl className="flex gap-5 text-right">
              <div>
                <dt className="text-[13px] text-muted">Droid tool calls in Daytona</dt>
                <dd className="num text-[20px] font-semibold text-ink">{counts.daytonaCalls}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-muted">Host tools blocked</dt>
                <dd className={`num text-[20px] font-semibold ${blocked ? 'text-warning' : 'text-ink'}`}>{blocked}</dd>
              </div>
            </dl>
          }
        />
        {hostToolsOff && (
          <p className="mt-3 flex items-center gap-2 text-[14px] text-muted">
            <ShieldCheck className="size-4 text-healthy" aria-hidden="true" />
            Host tools disabled. All {counts.isolation.sandboxTools?.length ?? 0} of Droid’s tools run inside the sandbox.
          </p>
        )}
      </div>

      <ol
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="scroll-quiet max-h-[560px] min-h-[240px] overflow-y-auto px-3 py-3 sm:px-4"
        aria-label="Incident timeline"
      >
        {rows.length === 0 && <li className="px-3 py-6 text-[15px] text-muted">Waiting for the first event…</li>}
        {rows.map((row, i) => (
          <TimelineRow key={row.id} row={row} start={start} last={i === rows.length - 1} />
        ))}
      </ol>
    </section>
  )
}

function TimelineRow({ row, start, last }) {
  const [open, setOpen] = useState(false)
  const detailId = useId()
  const Icon = ICON[row.kind] ?? Circle
  const chip = CHIP[row.kind] ?? 'bg-white text-agent border-line'
  const t = toMs(row.timestamp)
  const hasDetail = Boolean(row.detail) && row.kind !== 'message' && row.kind !== 'finding'
  const output = row.kind === 'command' || row.kind === 'exploit' || row.kind === 'failed'

  return (
    <li className="enter relative grid grid-cols-[3.25rem_2rem_minmax(0,1fr)] gap-x-3 rounded-xl px-2 py-2.5 sm:grid-cols-[3.75rem_2rem_minmax(0,1fr)]">
      <time className="num pt-1.5 text-right font-mono text-[12.5px] text-muted" dateTime={row.timestamp}>
        {offset(t - start)}
      </time>

      <div className="relative flex justify-center">
        {!last && <span aria-hidden="true" className="absolute top-8 -bottom-2.5 w-px bg-line" />}
        <span className={`relative grid size-8 place-items-center rounded-full border ${chip}`}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>

      <div className="min-w-0 pt-1">
        <RowBody row={row} />
        <MetaList
          className="mt-1 text-[13px] text-muted"
          gap="gap-y-0.5"
          items={[
            <span key="a" className={row.actor === 'Factory Droid' ? 'font-medium text-agent' : ''}>
              {row.actor}
            </span>,
            row.tool && (
              <span key="t" className="font-mono text-[12.5px]">
                {row.tool}
              </span>
            ),
            row.daytona && row.sandbox && (
              <span key="s">
                in Daytona <span className="font-mono text-[12.5px]">{shortId(row.sandbox)}</span>
              </span>
            ),
            !row.daytona && row.metadata?.sandboxId && (
              <span key="id" className="font-mono text-[12.5px]">
                {shortId(row.metadata.sandboxId)}
              </span>
            ),
          ]}
        />
        {hasDetail && (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={detailId}
              className="mt-1.5 inline-flex items-center gap-1 rounded-md text-[13px] font-medium text-muted hover:text-ink"
            >
              <ChevronRight className={`size-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
              {open ? 'Hide' : 'Show'} {output ? 'output' : 'details'}
            </button>
            {open && (
              <pre
                id={detailId}
                className="scroll-quiet mt-2 max-h-72 overflow-auto rounded-lg border border-line bg-[#faf9f6] p-3 font-mono text-[13px] leading-relaxed whitespace-pre text-ink"
              >
                {row.detail}
              </pre>
            )}
          </>
        )}
      </div>
    </li>
  )
}

function RowBody({ row }) {
  if (row.kind === 'message') {
    return <p className="text-[16px] leading-snug text-agent italic">“{(row.detail ?? row.title).trim()}”</p>
  }
  if (row.kind === 'command') {
    const ok = row.exitCode === 0
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <code className="font-mono text-[14.5px] break-all text-ink">$ {row.command ?? row.title}</code>
        {row.exitCode != null && (
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[12px] font-medium ${
              ok ? 'bg-healthy-soft text-healthy' : 'bg-incident-soft text-incident'
            }`}
          >
            exit {row.exitCode}
          </span>
        )}
      </p>
    )
  }
  if (row.kind === 'read' && row.files?.length > 1) {
    return (
      <div>
        <p className="text-[16px] leading-snug text-ink">Read {row.files.length} files</p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {row.files.map((f) => (
            <li key={f} className="rounded-md bg-subtle px-1.5 py-0.5 font-mono text-[12.5px] text-ink">
              {f}
            </li>
          ))}
        </ul>
      </div>
    )
  }
  const strong = ['write', 'finding', 'exploit', 'passed', 'resolved', 'failed', 'alert'].includes(row.kind)
  return (
    <div>
      <p className={`text-[16px] leading-snug ${strong ? 'font-medium' : ''} ${row.kind === 'exploit' || row.kind === 'failed' ? 'text-incident' : 'text-ink'}`}>
        {row.title}
      </p>
      {row.kind === 'finding' && row.detail && <p className="mt-1 text-[15px] leading-relaxed text-muted">{row.detail}</p>}
    </div>
  )
}
