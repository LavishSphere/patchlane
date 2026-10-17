import { ArrowDown, Box, FlaskConical, Landmark, Sparkles, UserCheck } from 'lucide-react'

/** The architecture at a glance: who works where, and what crosses between them. */
export default function LaneDiagram() {
  return (
    <figure className="enter min-w-0" aria-labelledby="lane-caption">
      <div className="card overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-subtle px-5 py-3">
          <span className="flex items-center gap-2 text-[14px] font-medium text-ink">
            <Landmark className="size-4 text-muted" aria-hidden="true" />
            Production
          </span>
          <span className="text-[13px] text-muted">never handed to the agent</span>
        </div>

        <div className="p-4 sm:p-5">
          <Node icon={Box} title="Agent sandbox" tag="Daytona · untrusted" strong>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-[13px] font-medium text-canvas">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Factory Droid
            </span>
            <span className="mt-2 block">reproduces the exploit, finds the bug and patches it, using tools that only run in here.</span>
          </Node>
          <Edge label="source diff only" />
          <Node icon={FlaskConical} title="Verification sandbox" tag="Daytona · clean">
            Held-out tests and a replay of the incident traffic, somewhere Droid has never been.
          </Node>
          <Edge label="evidence" />
          <Node icon={UserCheck} title="Human approval" tag="Operator">
            Approve or reject. Then both sandboxes are destroyed.
          </Node>
        </div>
      </div>
      <figcaption id="lane-caption" className="mt-3 px-1 text-[13px] text-muted">
        Factory is the engineer. Daytona is the isolated machine.
      </figcaption>
    </figure>
  )
}

function Node({ icon: Icon, title, tag, strong, children }) {
  return (
    <div className={`rounded-xl border p-4 ${strong ? 'border-ink/15 bg-[#fbfaf7]' : 'border-line'}`}>
      <div className="flex items-start gap-3">
        <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${strong ? 'bg-ink text-white' : 'bg-subtle text-ink'}`}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[16px] leading-tight font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-[13px] text-muted">{tag}</p>
        </div>
      </div>
      <div className="mt-1 pl-11 text-[14px] leading-relaxed text-muted">{children}</div>
    </div>
  )
}

function Edge({ label }) {
  return (
    <div className="flex items-center gap-3 py-1.5 pl-[1.6rem]" aria-hidden="true">
      <span className="flex flex-col items-center">
        <span className="h-2 w-px bg-[#cfcac0]" />
        <ArrowDown className="size-3.5 text-muted" />
      </span>
      <span className="font-mono text-[12.5px] text-muted">{label}</span>
    </div>
  )
}
