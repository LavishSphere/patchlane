import { Box, FlaskConical, Sparkles, UserCheck } from 'lucide-react'
import { Container, Heading } from './ui'

// The pipeline, written the way the experience list on khayrul.com reads:
// what happens, who does it, where it runs.
const STEPS = [
  {
    title: 'Reproduce the exploit',
    who: 'Daytona',
    where: 'Agent sandbox',
    Icon: Box,
    body: 'Patchlane creates a Daytona sandbox with networking turned off and copies the bank service into it. It runs the failing test and replays the transfers from the incident window, so the damage is measured before anyone edits code.',
    tags: ['Daytona', 'No network', 'Transfer replay'],
  },
  {
    title: 'Investigate and patch',
    who: 'Factory Droid',
    where: 'Agent sandbox',
    Icon: Sparkles,
    body: 'Droid reads the code, runs commands and writes a fix. It can only call the tools listed here, and each one runs inside the sandbox. Its built-in tools for the host machine are turned off, and any call to one is logged as blocked.',
    tags: [
      'sandbox_list_files',
      'sandbox_read_file',
      'sandbox_search',
      'sandbox_write_file',
      'sandbox_exec',
      'sandbox_run_tests',
      'sandbox_git_diff',
    ],
    mono: true,
  },
  {
    title: 'Verify in a clean sandbox',
    who: 'Patchlane',
    where: 'Verification sandbox',
    Icon: FlaskConical,
    body: 'Patchlane takes the source diff from the first sandbox (and nothing else) and applies it to a fresh copy of the service in a second sandbox. There it runs held-out tests Droid never saw, the regression suite, and a replay of every transfer from the incident.',
    tags: ['Held-out tests', 'Regression suite', 'Transfer replay'],
  },
  {
    title: 'Approve and clean up',
    who: 'Operator',
    where: 'Dashboard',
    Icon: UserCheck,
    body: 'The operator reads the results and the diff, then approves or rejects the patch. Either way, both sandboxes are destroyed. On approval the patch is packaged and the unauthorized transfers are listed for reversal.',
    tags: ['Approval', 'Reversal list'],
  },
]

export default function HowItWorks() {
  return (
    <Container as="section" id="how-it-works" aria-labelledby="how-title" className="scroll-mt-28">
      <div className="border-t border-line py-14 sm:py-16">
        <Heading id="how-title">How it works</Heading>
        <ol className="relative mt-9">
          <span aria-hidden="true" className="absolute top-3 bottom-3 left-[19px] w-px bg-line" />
          {STEPS.map(({ title, who, where, Icon, body, tags, mono }) => (
            <li key={title} className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-x-5 pb-10 last:pb-0">
              <span className="relative z-[1] grid size-10 place-items-center rounded-[10px] border border-line bg-surface text-ink">
                <Icon className="size-[18px]" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <h3 className="text-[18px] leading-snug font-bold text-ink">{title}</h3>
                  <span className="text-[14px] text-muted">{where}</span>
                </div>
                <p className="text-[15px] font-medium text-accent">{who}</p>
                <p className="mt-2 max-w-[52rem] text-[16px] leading-relaxed text-body">{body}</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <li key={tag} className={`tag ${mono ? 'font-mono text-[12.5px]' : ''}`}>
                      {tag}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Container>
  )
}
