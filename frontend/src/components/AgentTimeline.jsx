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
import { Heading, MetaList } from './ui'

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
  alert: 'bg-incident text-canvas border-incident',
  exploit: 'bg-incident-soft text-incident border-incident/30',
  write: 'bg-accent text-canvas border-accent',
  finding: 'bg-accent text-canvas border-accent',
  passed: 'bg-healthy text-canvas border-healthy',
  resolved: 'bg-healthy text-canvas border-healthy',
  failed: 'bg-incident text-canvas border-incident',
  blocked: 'bg-warning-soft text-warning border-warning/30',
  error: 'bg-warning-soft text-warning border-warning/30',
  'guard-warn': 'bg-warning-soft text-warning border-warning/30',
  approved: 'bg-healthy-soft text-healthy border-healthy/30',
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
    <section id="timeline" aria-labelledby="timeline-title" className="flex min-w-0 scroll-mt-32 flex-col">
      <Heading id="timeline-title">Timeline</Heading>
      <MetaList
        className="mt-2 text-[15px] text-body"
        items={[
          <span key="calls">
            <span className="num font-semibold text-ink">{counts.daytonaCalls}</span> Droid tool calls in Daytona
          </span>,
          <span key="blocked">
            <span className={`num font-semibold ${blocked ? 'text-warning' : 'text-ink'}`}>{blocked}</span> host tool calls
            blocked
          </span>,
        ]}
      />
      {hostToolsOff && (
        <p className="mt-1 flex items-center gap-2 text-[14px] text-muted">
          <ShieldCheck className="size-4 shrink-0 text-healthy" aria-hidden="true" />
          Host tools turned off. All {counts.isolation.sandboxTools?.length ?? 0} of Droid’s tools run inside the sandbox.
        </p>
      )}

      <ol
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="scroll-quiet mt-5 max-h-[560px] min-h-[240px] overflow-y-auto rounded-xl border border-line bg-surface px-2 py-2 sm:px-3"
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
  const chip = CHIP[row.kind] ?? 'bg-surface text-body border-line'
  const t = toMs(row.timestamp)
  const hasDetail = Boolean(row.detail) && row.kind !== 'message' && row.kind !== 'finding'
  const output = row.kind === 'command' || row.kind === 'exploit' || row.kind === 'failed'

  return (
    <li className="enter relative grid grid-cols-[1.75rem_minmax(0,1fr)_auto] gap-x-3 px-2 py-2.5 sm:gap-x-4">
      <div className="relative flex justify-center">
        {!last && <span aria-hidden="true" className="absolute top-8 -bottom-3 w-px bg-line" />}
        <span className={`relative grid size-7 place-items-center rounded-full border ${chip}`}>
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
      </div>

      <div className="min-w-0 pt-0.5">
        <RowBody row={row} />
        <MetaList
          className="mt-0.5 text-[13px] text-muted"
          gap="gap-y-0.5"
          items={[
            <span key="a" className={row.actor === 'Factory Droid' ? 'font-medium text-accent' : ''}>
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
              className="mt-1 inline-flex items-center gap-1 rounded-md text-[13px] font-medium text-muted hover:text-accent"
            >
              <ChevronRight className={`size-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
              {open ? 'Hide' : 'Show'} {output ? 'output' : 'details'}
            </button>
            {open && (
              <pre
                id={detailId}
                className="scroll-quiet mt-2 max-h-72 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[13px] leading-relaxed whitespace-pre text-ink"
              >
                {row.detail}
              </pre>
            )}
          </>
        )}
      </div>

      <time className="num pt-1 text-right font-mono text-[12.5px] text-muted" dateTime={row.timestamp}>
        {offset(t - start)}
      </time>
    </li>
  )
}

function RowBody({ row }) {
  if (row.kind === 'message') {
    return <p className="text-[16px] leading-snug text-body italic">“{(row.detail ?? row.title).trim()}”</p>
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
            <li key={f} className="rounded-md border border-line bg-canvas px-1.5 py-0.5 font-mono text-[12.5px] text-body">
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
      <p className={`text-[16px] leading-snug ${strong ? 'font-semibold' : ''} ${row.kind === 'exploit' || row.kind === 'failed' ? 'text-incident' : 'text-ink'}`}>
        {row.title}
      </p>
      {row.kind === 'finding' && row.detail && <p className="mt-1 text-[15px] leading-relaxed text-body">{row.detail}</p>}
    </div>
  )
}
