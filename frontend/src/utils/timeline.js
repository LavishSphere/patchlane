// Turns PatchlaneEvents into timeline rows. Presentation only: consecutive file
// reads collapse into one row, and a command's result is folded into the
// command row. Nothing here feeds incident state.

const ACTOR = {
  incident: 'Patchlane',
  sandbox: 'Daytona',
  repository: 'Patchlane',
  droid: 'Factory Droid',
  verification: 'Patchlane',
  approval: 'Patchlane',
  remediation: 'Patchlane',
  integration: 'Patchlane',
}

function actorOf(event) {
  const type = event.type
  if (type === 'incident.detected') return 'Fraud rule'
  if (type === 'droid.isolation') return 'Patchlane'
  if (type === 'droid.tool.blocked') return 'Patchlane'
  if (type === 'approval.received') return 'Operator'
  if (type === 'verification.started' || type === 'verification.passed' || type === 'verification.failed') {
    return 'Clean sandbox'
  }
  return ACTOR[type.split('.')[0]] ?? 'Patchlane'
}

function kindOf(event) {
  const t = event.type
  if (t === 'droid.message') return 'message'
  if (t === 'droid.command') return 'command'
  if (t === 'droid.file.read') return 'read'
  if (t === 'droid.file.written') return 'write'
  if (t === 'droid.tool.blocked') return 'blocked'
  if (t === 'droid.tool.call') {
    const tool = event.metadata?.tool ?? ''
    if (tool.includes('search')) return 'search'
    if (tool.includes('diff')) return 'diff'
    if (tool.includes('list')) return 'list'
    if (tool.includes('test')) return 'command'
    return 'tool'
  }
  if (t === 'droid.started' || t === 'droid.finished') return t === 'droid.started' ? 'droid' : 'finding'
  if (t === 'droid.isolation') return 'isolation'
  if (t.startsWith('sandbox.')) return t === 'sandbox.destroyed' ? 'destroyed' : 'sandbox'
  if (t === 'repository.uploaded') return 'upload'
  if (t === 'incident.detected') return 'alert'
  if (t === 'incident.reproduced') return 'exploit'
  if (t === 'incident.resolved') return 'resolved'
  if (t === 'incident.failed' || t === 'verification.failed') return 'failed'
  if (t === 'verification.guard') return event.metadata?.tampered?.length ? 'guard-warn' : 'guard'
  if (t === 'verification.started') return 'verify'
  if (t === 'verification.passed') return 'passed'
  if (t === 'approval.requested') return 'approval'
  if (t === 'approval.received') return 'approved'
  if (t === 'remediation.packaged') return 'package'
  if (t === 'integration.error') return 'error'
  return 'other'
}

function inDaytona(event) {
  return event.metadata?.provider === 'daytona'
}

/** Build display rows from the raw event list. */
export function buildTimeline(events) {
  const rows = []
  let openCommand = null

  for (const event of events) {
    const kind = kindOf(event)
    const base = {
      id: event.id,
      kind,
      type: event.type,
      title: event.title,
      detail: event.detail ?? null,
      timestamp: event.timestamp,
      actor: actorOf(event),
      tool: event.metadata?.tool ?? null,
      sandbox: event.metadata?.sandbox ?? event.metadata?.sandboxId ?? null,
      daytona: inDaytona(event),
      metadata: event.metadata ?? {},
    }

    if (event.type === 'droid.command.finished') {
      const exit = event.metadata?.exit_code ?? event.metadata?.exitCode
      if (openCommand) {
        openCommand.exitCode = exit
        openCommand.detail = event.detail ?? openCommand.detail
        openCommand = null
      } else {
        rows.push({ ...base, kind: 'command', exitCode: exit, title: event.title })
      }
      continue
    }

    if (kind === 'read') {
      const prev = rows[rows.length - 1]
      const path = event.metadata?.path ?? event.title.replace(/^Reading\s+/, '')
      if (prev && prev.kind === 'read') {
        prev.files.push(path)
        prev.title = `Read ${prev.files.length} files`
        continue
      }
      rows.push({ ...base, files: [path], title: event.title })
      continue
    }

    const row = { ...base }
    if (kind === 'list' && /^Listing \.?\/?$/.test(event.title.trim())) row.title = 'Listing the repository'
    if (kind === 'command') {
      row.command = event.title.replace(/^\$\s*/, '')
      openCommand = row
    }
    rows.push(row)
  }
  return rows
}

/** Live counters for the timeline header, from events. */
export function timelineCounts(events) {
  let daytonaCalls = 0
  let blocked = 0
  let isolation = null
  for (const e of events) {
    if (e.type.startsWith('droid.') && inDaytona(e) && e.type !== 'droid.command.finished') daytonaCalls++
    if (e.type === 'droid.tool.blocked') blocked++
    if (e.type === 'droid.isolation') isolation = e.metadata ?? {}
  }
  return { daytonaCalls, blocked, isolation }
}
