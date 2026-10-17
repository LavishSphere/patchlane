import { KeyRound, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/**
 * Asks for the operator token and checks it with the API before operator mode opens.
 * It is kept in sessionStorage, never in the URL. onSubmit resolves when the token is accepted
 * and throws with a message to show when it isn't.
 */
export default function OperatorDialog({ open, onClose, onSubmit }) {
  const dialog = useRef(null)
  const input = useRef(null)
  const [token, setToken] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      onClose={() => {
        setToken('')
        setError(null)
        setChecking(false)
        onClose()
      }}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current.close()
      }}
      aria-labelledby="operator-title"
      className="m-auto w-[min(92vw,28rem)] rounded-xl border border-line bg-surface p-0 text-ink shadow-[var(--shadow)] backdrop:bg-black/40 backdrop:backdrop-blur-[2px]"
    >
      <form
        method="dialog"
        className="p-6"
        onSubmit={async (e) => {
          e.preventDefault()
          const value = token.trim()
          if (!value || checking) return
          setChecking(true)
          setError(null)
          try {
            await onSubmit(value)
            dialog.current?.close()
          } catch (err) {
            setError({ title: err.message, detail: err.detail ?? '' })
            requestAnimationFrame(() => input.current?.select())
          } finally {
            setChecking(false)
          }
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-[10px] border border-line bg-canvas text-accent">
              <KeyRound className="size-[18px]" aria-hidden="true" />
            </span>
            <h2 id="operator-title" className="text-[20px] font-bold">
              Operator mode
            </h2>
          </div>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="grid size-8 place-items-center rounded-full text-muted hover:bg-subtle hover:text-ink"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-4 text-[15px] leading-relaxed text-body">
          The live controls start real Daytona sandboxes and real Factory Droid runs. Your token is kept in this browser tab and
          cleared when you close it.
        </p>
        <label htmlFor="operator-token" className="mt-5 block text-[14px] font-medium">
          Operator token
        </label>
        <input
          ref={input}
          id="operator-token"
          type="password"
          autoComplete="current-password"
          value={token}
          onChange={(e) => {
            setToken(e.target.value)
            setError(null)
          }}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'operator-token-error' : undefined}
          className={`mt-1.5 h-11 w-full rounded-lg border bg-canvas px-3.5 font-mono text-[15px] text-ink outline-none focus:ring-2 ${
            error ? 'border-incident focus:border-incident focus:ring-incident/20' : 'border-line focus:border-accent focus:ring-accent/20'
          }`}
          autoFocus
        />
        {error && (
          <div
            id="operator-token-error"
            role="alert"
            className="mt-3 flex gap-2.5 rounded-lg border border-incident/30 bg-incident-soft px-3.5 py-3"
          >
            <TriangleAlert className="mt-0.5 size-[18px] shrink-0 text-incident" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-incident">{error.title}</p>
              <p className="mt-0.5 text-[14px] leading-relaxed text-body">{error.detail}</p>
            </div>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-quiet h-11 px-4" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="btn-primary h-11 px-5 text-[15px]" disabled={!token.trim() || checking}>
            {checking ? 'Checking…' : 'Sign in'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
