import { ChevronDown } from 'lucide-react'
import { useId } from 'react'

/** Operator only: the seeded case the next trigger runs. The list comes from GET /api/cases. */
export default function CasePicker({ operator }) {
  const id = useId()
  const cases = operator?.cases ?? []
  if (!cases.length) return null

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] text-muted">
        Seeded case
      </label>
      <div className="relative w-full sm:w-fit sm:max-w-full">
        <select
          id={id}
          value={operator.caseId ?? ''}
          onChange={(e) => operator.chooseCase(e.target.value)}
          disabled={operator.busy}
          className="h-11 w-full min-w-0 appearance-none truncate rounded-lg border border-line bg-surface pr-10 pl-3.5 text-[16px] text-ink transition-colors duration-200 hover:border-accent disabled:opacity-50"
        >
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.severity} · {c.title}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
      </div>
    </div>
  )
}
