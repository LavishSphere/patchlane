import { KeyRound, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/** Asks for the operator token. It is kept in sessionStorage, never in the URL. */
export default function OperatorDialog({ open, onClose, onSubmit }) {
  const dialog = useRef(null)
  const [token, setToken] = useState('')

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
        onClose()
      }}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current.close()
      }}
      aria-labelledby="operator-title"
      className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-line bg-white p-0 text-ink shadow-xl backdrop:bg-ink/30 backdrop:backdrop-blur-[2px]"
    >
      <form
        method="dialog"
        className="p-6"
        onSubmit={(e) => {
          e.preventDefault()
          const value = token.trim()
          if (!value) return
          onSubmit(value)
          dialog.current?.close()
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-ink text-white">
              <KeyRound className="size-[18px]" aria-hidden="true" />
            </span>
            <h2 id="operator-title" className="text-[20px] font-semibold">
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
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          Live controls start real Daytona sandboxes and Factory Droid runs. The token stays in this browser tab only.
        </p>
        <label htmlFor="operator-token" className="mt-5 block text-[14px] font-medium">
          Operator token
        </label>
        <input
          id="operator-token"
          type="password"
          autoComplete="current-password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="mt-1.5 h-11 w-full rounded-xl border border-line bg-canvas px-3.5 font-mono text-[15px] outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
          autoFocus
        />
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-quiet h-11 px-4" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="btn-primary h-11 px-5 text-[15px]" disabled={!token.trim()}>
            Unlock live controls
          </button>
        </div>
      </form>
    </dialog>
  )
}
