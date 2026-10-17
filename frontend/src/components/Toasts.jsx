import { CircleAlert, X } from 'lucide-react'

export default function Toasts({ toasts, onDismiss }) {
  return (
    <div aria-live="assertive" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className="enter pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-[15px] text-ink shadow-[var(--shadow)]"
        >
          <CircleAlert className={`mt-0.5 size-5 shrink-0 ${t.tone === 'incident' ? 'text-incident' : 'text-warning'}`} aria-hidden="true" />
          <p className="flex-1">{t.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="grid size-6 place-items-center rounded-full text-muted hover:text-ink"
            aria-label="Dismiss"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}
