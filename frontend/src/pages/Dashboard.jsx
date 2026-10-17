import AgentTimeline from '../components/AgentTimeline'
import BenchmarkPanel from '../components/BenchmarkPanel'
import DiffViewer from '../components/DiffViewer'
import HeroStatus from '../components/HeroStatus'
import HowItWorks from '../components/HowItWorks'
import ImpactSummary from '../components/ImpactSummary'
import IncidentSummary from '../components/IncidentSummary'
import Recovery from '../components/Recovery'
import RemediationEvidence from '../components/RemediationEvidence'
import RemediationSummary from '../components/RemediationSummary'
import { SandboxPanel } from '../components/SandboxCard'
import StageStepper from '../components/StageStepper'
import { Container, Enter } from '../components/ui'
import { phaseOf } from '../utils/status'

export default function Dashboard({ data, mode, replay, operator, benchmark }) {
  const { incident, events } = data
  const phase = phaseOf(incident)
  // Once there is a verdict to look at, the evidence moves above the work log.
  const reviewFirst =
    phase === 'review' || phase === 'resolved' || incident?.status === 'verification_failed' || incident?.status === 'rejected'

  const work = (
    <Container as="section" aria-label="Investigation" className="py-6">
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8">
        <AgentTimeline incident={incident} events={events} />
        <SandboxPanel incident={incident} />
      </div>
    </Container>
  )

  const review = (
    <Container as="section" aria-label="Review" className="space-y-6 py-6 sm:space-y-8 sm:py-8">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8">
        <RemediationEvidence incident={incident} />
        <RemediationSummary incident={incident} />
      </div>
      {incident?.diff != null && <DiffViewer diff={incident.diff} />}
    </Container>
  )

  const details = incident && (
    <Container as="section" aria-label="Incident details" className="py-6 sm:py-8">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8">
        <IncidentSummary incident={incident} />
        <ImpactSummary incident={incident} />
      </div>
    </Container>
  )

  return (
    <main id="main">
      <HeroStatus incident={incident} mode={mode} replay={replay} operator={operator} />

      {incident && <StageStepper incident={incident} />}

      {phase === 'healthy' && <HowItWorks />}

      {phase === 'detected' && <Enter key="detected">{details}</Enter>}

      {incident && phase !== 'detected' && (
        <Enter key={reviewFirst ? 'review-first' : 'work-first'}>
          {phase === 'resolved' && (
            <Container className="pt-6 sm:pt-8">
              <Recovery incident={incident} events={events} />
            </Container>
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

      <div className="mt-10">
        <BenchmarkPanel benchmark={benchmark} />
      </div>
    </main>
  )
}
