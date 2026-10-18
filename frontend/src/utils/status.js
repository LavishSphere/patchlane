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

// Cases without transfers in the incident window have nothing to replay.
const NO_REPLAY_SUB = {
  reproducing: 'Before anyone edits code, Patchlane runs the failing test and the regression suite in the sandbox.',
  verifying:
    'Patchlane copied the source diff into a second, clean sandbox. It’s running held-out tests Droid never saw and the regression suite.',
}

// Several bugs at once: one failing test per bug.
function reproducingMany(n, replay) {
  const all = n === 2 ? 'both' : `all ${countWord(n)}`
  return {
    title: `Reproducing ${all} bugs`,
    sub: replay
      ? `Before anyone edits code, Patchlane runs ${all} failing tests in the sandbox and replays the transfers from the incident window.`
      : `Before anyone edits code, Patchlane runs ${all} failing tests and the regression suite in the sandbox.`,
  }
}

export function heroCopy(incident) {
  const copy = HERO[incident?.status] ?? { title: incident?.status ?? '' }
  const n = bugsOf(incident).length
  if (n > 1 && incident.status === 'reproducing') return { ...copy, ...reproducingMany(n, hasReplay(incident)) }
  const sub = !hasReplay(incident) && NO_REPLAY_SUB[incident?.status]
  return sub ? { ...copy, sub } : copy
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five']
const countWord = (n) => WORDS[n] ?? String(n)

/**
 * Every bug in the incident, bug 1 first: { caseId, variantId, variantLabel,
 * safeguard, title, endpoint }. Bug 1 is described by the incident's own
 * fields and the rest by extraBugs. Snapshots from before extraBugs existed
 * may carry secondBug instead, and recordings carry neither.
 */
export function bugsOf(incident) {
  if (!incident) return []
  const first = {
    caseId: incident.caseId,
    variantId: incident.variantId,
    variantLabel: incident.variantLabel,
    safeguard: incident.safeguard,
    title: incident.title,
    endpoint: incident.endpoint,
  }
  const extra = Array.isArray(incident.extraBugs) && incident.extraBugs.length > 0 ? incident.extraBugs : [incident.secondBug]
  return [first, ...extra.filter((b) => b && typeof b === 'object')]
}

/** "Two bugs at once", "Three bugs at once". */
export function manyBugsTitle(n) {
  const word = countWord(n)
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} bugs at once`
}

/** Each endpoint once, in bug order. */
export function endpointsOf(incident) {
  return bugsOf(incident)
    .map((b) => b.endpoint)
    .filter((ep, i, list) => ep && list.indexOf(ep) === i)
}

/** True when incident.impact lists unauthorized transfers or affected customers. */
export function hasImpact(incident) {
  const impact = incident?.impact
  if (!impact) return false
  return impact.unauthorizedTransfers > 0 || (impact.affectedCustomers?.length ?? 0) > 0
}

/**
 * True when the incident has transfers to replay: a replay result is in the
 * snapshot, or incident.impact counts transfers in the incident window.
 */
export function hasReplay(incident) {
  if (!incident) return false
  if (incident.before?.replay || incident.verification?.after?.replay) return true
  const impact = incident.impact ?? {}
  return impact.unauthorizedTransfers > 0 || impact.legitTransfersInWindow > 0
}

/** Who raised the alert: the fraud rule for transfer incidents, monitoring for the rest. */
export function detectedBy(incident) {
  return !incident || hasImpact(incident) ? 'Fraud rule' : 'Monitoring'
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
