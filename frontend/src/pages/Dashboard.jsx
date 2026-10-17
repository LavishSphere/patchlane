import AgentTimeline from '../components/AgentTimeline'
import BenchmarkPanel from '../components/BenchmarkPanel'
import DiffViewer from '../components/DiffViewer'
import HeroStatus from '../components/HeroStatus'
import HowItWorks from '../components/HowItWorks'
import ImpactSummary from '../components/ImpactSummary'
import IncidentSummary from '../components/IncidentSummary'
import RecordingList from '../components/RecordingList'
import Recovery from '../components/Recovery'
import RemediationEvidence from '../components/RemediationEvidence'
import RemediationSummary from '../components/RemediationSummary'
import { SandboxPanel } from '../components/SandboxCard'
import StageStepper from '../components/StageStepper'
import { Container, Enter } from '../components/ui'
import { hasImpact, phaseOf } from '../utils/status'

/** One full-width band of the page, separated from the one above by a hairline. */
function Band({ label, children }) {
  return (
    <Container as="section" aria-label={label}>
      <div className="border-t border-line pt-10 pb-12 sm:pt-11 sm:pb-14">{children}</div>
    </Container>
  )
}

export default function Dashboard({ data, mode, replay, operator, benchmark, gallery }) {
  const { incident, events } = data
  const phase = phaseOf(incident)
  const resolved = phase === 'resolved'
  // Only incidents with unauthorized transfers have accounts to list and transfers to reverse.
  const impact = hasImpact(incident)
  // Once there is a verdict to look at, the evidence moves above the work log.
  const reviewFirst =
    phase === 'review' || resolved || incident?.status === 'verification_failed' || incident?.status === 'rejected'

  const work = (
    <Band label="Investigation">
      <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-10">
        <AgentTimeline incident={incident} events={events} />
        <SandboxPanel incident={incident} />
      </div>
    </Band>
  )

  const review = (
    <>
      <Band label="Review">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-0">
          <div className="min-w-0 lg:pr-12">
            <RemediationEvidence incident={incident} benchmark={mode === 'live' ? benchmark : null} />
          </div>
          <div className="min-w-0 lg:border-l lg:border-line lg:pl-12">
            <RemediationSummary incident={incident} />
          </div>
        </div>
      </Band>
      {incident?.diff != null && (
        <Band label="Patch">
          <DiffViewer diff={incident.diff} />
        </Band>
      )}
    </>
  )

  const details = incident && (
    <Band label="Incident details">
      {resolved || !impact ? (
        <IncidentSummary incident={incident} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-14">
          <IncidentSummary incident={incident} />
          <ImpactSummary incident={incident} />
        </div>
      )}
    </Band>
  )

  return (
    <main id="main">
      <HeroStatus incident={incident} mode={mode} replay={replay} operator={operator} benchmark={benchmark} gallery={gallery} />

      {incident && <StageStepper incident={incident} />}

      {phase === 'healthy' && gallery && <RecordingList gallery={gallery} />}

      {phase === 'healthy' && <HowItWorks />}

      {phase === 'detected' && <Enter key="detected">{details}</Enter>}

      {incident && phase !== 'detected' && (
        <Enter key={reviewFirst ? 'review-first' : 'work-first'}>
          {resolved && (
            <Band label="Recovery">
              <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
                <Recovery incident={incident} events={events} />
                {impact && <ImpactSummary incident={incident} reversal />}
              </div>
            </Band>
          )}
          {reviewFirst ? (
            <>
              {review}
              {work}
            </>
          ) : (
            <>
              {work}
              {review}
            </>
          )}
          {details}
        </Enter>
      )}

      <BenchmarkPanel benchmark={benchmark} />
    </main>
  )
}
