import { Play } from 'lucide-react'
import { duration } from '../utils/format'
import { Container, Heading } from './ui'

/**
 * Replay only: every run listed in public/recordings/index.json. Choosing one
 * loads it from the start and plays it in the page above.
 */
export default function RecordingList({ gallery }) {
  const { list, selected, choose } = gallery

  return (
    <Container as="section" id="recordings" aria-labelledby="recordings-title" className="scroll-mt-28">
      <div className="border-t border-line py-14 sm:py-16">
        <Heading id="recordings-title" aside={`${list.length} runs`}>
          Recorded runs
        </Heading>
        <p className="mt-3 max-w-[44rem] text-[16px] leading-relaxed text-body">
          Each run below was recorded from the live pipeline, with real Daytona sandboxes and a real Droid session. Choose one
          to replay it at the top of this page.
        </p>
        <div
          aria-hidden="true"
          className="mt-6 hidden grid-cols-[2rem_minmax(0,1fr)_4.5rem_4rem] gap-x-4 border-b border-line-strong pb-2.5 text-[13.5px] text-muted sm:grid"
        >
          <span />
          <span>Incident and the safeguard it broke</span>
          <span>Severity</span>
          <span className="text-right">Run time</span>
        </div>
        <ul className="mt-6 border-t border-line sm:mt-0 sm:border-t-0">
          {list.map((r) => {
            const current = r.name === selected
            return (
              <li key={r.name} className="border-b border-line">
                <button
                  type="button"
                  aria-current={current ? 'true' : undefined}
                  onClick={() => {
                    choose(r.name, { play: true })
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="group grid w-full grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-4 py-3.5 text-left sm:grid-cols-[2rem_minmax(0,1fr)_4.5rem_4rem] sm:items-center"
                >
                  <span
                    className={`mt-0.5 grid size-8 place-items-center rounded-full border transition-colors duration-200 sm:mt-0 ${
                      current
                        ? 'border-ink bg-ink text-canvas group-hover:border-accent group-hover:bg-accent group-hover:text-white'
                        : 'border-line bg-surface text-ink group-hover:border-accent group-hover:text-accent'
                    }`}
                    aria-hidden="true"
                  >
                    <Play className="size-3.5 translate-x-px" fill="currentColor" />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block text-[16px] leading-snug font-semibold transition-colors group-hover:text-accent ${
                        current ? 'text-accent' : 'text-ink'
                      }`}
                    >
                      {r.title || r.name}
                    </span>
                    {r.safeguard && <span className="mt-0.5 block text-[15px] leading-snug text-muted">{r.safeguard}</span>}
                    <span className="mt-1 flex gap-3 font-mono text-[13.5px] text-muted sm:hidden">
                      {r.severity && <span>{r.severity}</span>}
                      {typeof r.durationS === 'number' && <span className="num">{duration(r.durationS * 1000)}</span>}
                    </span>
                  </span>
                  <span className="hidden font-mono text-[14px] text-muted sm:block">{r.severity}</span>
                  <span className="num hidden text-right font-mono text-[14px] text-muted sm:block">
                    {typeof r.durationS === 'number' ? duration(r.durationS * 1000) : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Container>
  )
}
