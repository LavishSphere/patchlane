import { Box, FlaskConical, Sparkles, UserCheck } from 'lucide-react'
import { Container } from './ui'

const STEPS = [
  {
    n: '01',
    title: 'Reproduce',
    who: 'Daytona · agent sandbox',
    Icon: Box,
    body: 'A fresh sandbox gets a copy of the service. The exploit runs there, so the damage is measured before anyone touches code.',
  },
  {
    n: '02',
    title: 'Patch',
    who: 'Factory Droid',
    Icon: Sparkles,
    body: 'Droid decides what to read, run and change. Every tool it has acts inside the sandbox; its tools on the host are switched off.',
  },
  {
    n: '03',
    title: 'Verify',
    who: 'Daytona · clean sandbox',
    Icon: FlaskConical,
    body: 'A second sandbox applies only the source diff, runs tests Droid never saw, and replays the incident traffic.',
  },
  {
    n: '04',
    title: 'Recover',
    who: 'A human',
    Icon: UserCheck,
    body: 'An operator reviews the evidence and approves. The sandboxes are destroyed and the bad transfers are listed for reversal.',
  },
]

export default function HowItWorks() {
  return (
    <Container as="section" id="how-it-works" aria-labelledby="how-title" className="scroll-mt-28 pb-16 sm:pb-20">
      <div className="grid grid-cols-1 gap-6 border-t border-line pt-16 sm:pt-20 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
        <h2 id="how-title" className="font-serif text-[40px] leading-[1.02] tracking-[-0.01em] text-ink sm:text-[56px]">
          Factory Droid is the engineer.
          <span className="block text-muted">Daytona is the isolated machine.</span>
        </h2>
        <p className="max-w-[36rem] text-[17px] leading-relaxed text-muted sm:text-[18px]">
          No bank will hand an AI agent a shell on production, and reproducing an exploit means running attack code. Patchlane
          gives the agent a safe lane instead, and doesn’t let it grade its own homework.
        </p>
      </div>

      <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ n, title, who, Icon, body }) => (
          <li key={n} className="flex flex-col bg-white p-6">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[13px] text-faint">{n}</span>
              <Icon className="size-5 text-muted" aria-hidden="true" />
            </div>
            <h3 className="mt-8 text-[22px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
            <p className="mt-1 text-[14px] font-medium text-muted">{who}</p>
            <p className="mt-4 text-[16px] leading-relaxed text-muted">{body}</p>
          </li>
        ))}
      </ol>
    </Container>
  )
}
