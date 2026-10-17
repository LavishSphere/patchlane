// Everything here is derived from `incident.status` (and the incident snapshot).
// Events never drive state.

export const RUNNING = new Set(['sandbox_creating', 'reproducing', 'diagnosing', 'patching', 'verifying'])
export const FAILED = new Set(['investigation_failed', 'verification_failed', 'rejected'])

/** healthy | detected | running | review | resolved | failed */
export function phaseOf(incident) {
  if (!incident) return 'healthy'
  const s = incident.status
  if (s === 'detected') return 'detected'
  if (RUNNING.has(s)) return 'running'
  if (s === 'awaiting_approval') return 'review'
  if (s === 'resolved') return 'resolved'
  if (FAILED.has(s)) return 'failed'
  return 'running'
}

export const STAGES = [
  { key: 'detected', label: 'Detected', actor: 'Fraud rule' },
  { key: 'sandbox', label: 'Sandbox', actor: 'Daytona' },
  { key: 'reproduce', label: 'Reproduce', actor: 'Daytona' },
  { key: 'diagnose', label: 'Diagnose', actor: 'Factory Droid' },
  { key: 'patch', label: 'Patch', actor: 'Factory Droid' },
  { key: 'verify', label: 'Verify', actor: 'Clean sandbox' },
  { key: 'approval', label: 'Approval', actor: 'Operator' },
  { key: 'resolved', label: 'Resolved', actor: 'Patchlane' },
]

const STATUS_STAGE = {
  detected: 0,
  sandbox_creating: 1,
  reproducing: 2,
  diagnosing: 3,
  patching: 4,
  verifying: 5,
  awaiting_approval: 6,
  resolved: 7,
}

/**
 * Where the incident is on the lane.
 * Returns { index, outcome } where outcome is 'active' | 'done' | 'failed' | 'rejected'.
 * For failures the step is read from which parts of the snapshot exist.
 */
export function stageOf(incident) {
  if (!incident) return { index: -1, outcome: 'active' }
  const s = incident.status
  if (s === 'resolved') return { index: 7, outcome: 'done' }
  if (s === 'rejected') return { index: 6, outcome: 'rejected' }
  if (s === 'verification_failed') return { index: 5, outcome: 'failed' }
  if (s === 'investigation_failed') {
    let index = 1
    if (incident.agentSandbox) index = 2
    if (incident.before && !incident.before.reproPassed) index = 3
    if (incident.remediation) index = 5
    return { index, outcome: 'failed' }
  }
  return { index: STATUS_STAGE[s] ?? 0, outcome: 'active' }
}

const HERO = {
  detected: {
    title: 'Incident detected',
    tone: 'incident',
  },
  sandbox_creating: {
    title: 'Creating the agent sandbox',
    sub: 'Patchlane is starting a Daytona sandbox for this incident and copying the bank service into it.',
  },
  reproducing: {
    title: 'Reproducing the exploit',
    sub: 'Before anyone edits code, Patchlane runs the failing test in the sandbox and replays the transfers from the incident window.',
  },
  diagnosing: {
    title: 'Droid is investigating',
    sub: 'Factory Droid is reading code and running commands in the agent sandbox. Every tool it can call runs inside that sandbox.',
  },
  patching: {
    title: 'Droid is writing a patch',
    sub: 'Droid is editing the code in the agent sandbox and rerunning the tests there.',
  },
  verifying: {
    title: 'Verifying the patch',
    sub: 'Patchlane copied the source diff into a second, clean sandbox. It’s running held-out tests Droid never saw and replaying the incident’s transfers.',
  },
  awaiting_approval: {
    title: 'Patch verified, waiting for approval',
    sub: 'Verification in the clean sandbox is done. Read the results and the diff below, then approve or reject the patch.',
  },
  resolved: {
    title: 'Incident resolved',
    tone: 'healthy',
  },
  investigation_failed: {
    title: 'The investigation stopped',
    tone: 'incident',
  },
  verification_failed: {
    title: 'The patch failed verification',
    tone: 'incident',
  },
  rejected: {
    title: 'Patch rejected',
    sub: 'The operator rejected the patch. Nothing was packaged, and both sandboxes were destroyed.',
    tone: 'warning',
  },
}

export function heroCopy(incident) {
  return HERO[incident?.status] ?? { title: incident?.status ?? '' }
}

/** Header status pill. */
export function statusPill(incident) {
  if (!incident) return { label: 'All systems operational', short: 'Operational', tone: 'healthy' }
  const s = incident.status
  if (s === 'detected') return { label: `${incident.severity} · ${incident.id} open`, short: `${incident.severity} open`, tone: 'incident' }
  if (RUNNING.has(s)) return { label: `Investigating ${incident.id}`, short: 'Investigating', tone: 'agent', live: true }
  if (s === 'awaiting_approval') return { label: `${incident.id} awaiting approval`, short: 'Awaiting approval', tone: 'warning' }
  if (s === 'resolved') return { label: `${incident.id} resolved`, short: 'Resolved', tone: 'healthy' }
  if (s === 'rejected') return { label: `${incident.id} patch rejected`, short: 'Rejected', tone: 'warning' }
  return { label: `${incident.id} needs attention`, short: 'Failed', tone: 'incident' }
}

export const TONE_TEXT = {
  healthy: 'text-healthy',
  incident: 'text-incident',
  warning: 'text-warning',
  agent: 'text-agent',
  muted: 'text-muted',
}

export const TONE_DOT = {
  healthy: 'bg-healthy',
  incident: 'bg-incident',
  warning: 'bg-warning',
  agent: 'bg-agent',
  muted: 'bg-faint',
}
