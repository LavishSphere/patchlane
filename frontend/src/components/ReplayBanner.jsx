import { ChevronDown, History, Pause, Play, RotateCcw } from 'lucide-react'
import { dateTime, duration } from '../utils/format'
import { Container } from './ui'

const SPEEDS = [1, 4]

export default function ReplayBanner({ replay, gallery, notice, onRetryLive }) {
  const { status, position, duration: total, startedAt, speed } = replay
  const ready = status !== 'loading' && status !== 'error'
  const playing = status === 'playing'
  const progress = total ? Math.min(100, (position / total) * 100) : 0

  return (
    <div role="region" aria-label="Replay" className="border-b border-line bg-surface/90 backdrop-blur-md">
      <Container className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2">
        {gallery ? (
          <div className="flex w-full min-w-0 items-center gap-2 text-[14px] text-ink lg:w-auto lg:flex-1">
            <History className="size-4 shrink-0 text-accent" aria-hidden="true" />
            <label htmlFor="replay-recording" className="shrink-0 font-medium">
              Replaying
            </label>
            <RecordingSelect gallery={gallery} status={status} />
            <span className="hidden truncate text-muted 2xl:inline">
              · {status === 'error' ? 'recording unavailable' : startedAt ? dateTime(startedAt) : 'loading…'}
            </span>
          </div>
        ) : (
          <p className="flex min-w-0 items-center gap-2 text-[14px] text-ink">
            <History className="size-4 shrink-0 text-accent" aria-hidden="true" />
            <span className="shrink-0 font-medium">
              <span className="sm:hidden">Recorded run</span>
              <span className="hidden sm:inline">Replaying a recorded run</span>
            </span>
            <span className="truncate text-muted">
              · {status === 'error' ? 'recording unavailable' : startedAt ? dateTime(startedAt) : 'loading…'}
            </span>
          </p>
        )}

        {notice && (
          <p className="flex items-center gap-2 text-[14px] text-warning">
            {notice}
            {onRetryLive && (
              <button type="button" onClick={onRetryLive} className="font-medium text-ink underline underline-offset-4">
                Retry live
              </button>
            )}
          </p>
        )}

        <div className={`flex w-full items-center gap-3 ${gallery ? 'lg:ml-auto lg:w-auto' : 'sm:ml-auto sm:w-auto'}`}>
          <button
            type="button"
            onClick={playing ? replay.pause : replay.play}
            disabled={!ready}
            aria-label={playing ? 'Pause replay' : 'Play replay'}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-canvas transition-colors hover:bg-accent hover:text-white disabled:opacity-40"
          >
            {playing ? <Pause className="size-3.5" fill="currentColor" /> : <Play className="size-3.5 translate-x-px" fill="currentColor" />}
          </button>

          <input
            type="range"
            className={`scrubber min-w-0 flex-1 ${gallery ? 'lg:w-64 lg:flex-none' : 'sm:w-48 sm:flex-none lg:w-64'}`}
            min={0}
            max={Math.max(1, Math.round(total))}
            step={100}
            value={Math.round(position)}
            onChange={(e) => replay.seek(Number(e.target.value))}
            disabled={!ready}
            aria-label="Replay position"
            aria-valuetext={`${duration(position)} of ${duration(total)}`}
            style={{ '--p': `${progress}%` }}
          />

          <span className="num shrink-0 font-mono text-[13px] text-muted">
            {duration(position)} / {duration(total)}
          </span>

          <div role="group" aria-label="Replay speed" className="flex shrink-0 rounded-lg border border-line bg-canvas p-0.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => replay.setSpeed(s)}
                aria-pressed={speed === s}
                className={`num h-7 rounded-md px-2.5 font-mono text-[13px] font-medium transition-colors ${
                  speed === s ? 'bg-ink text-canvas' : 'text-muted hover:text-ink'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={replay.restart}
            disabled={!ready}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-40"
            aria-label="Restart replay"
            title="Restart"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
          </button>
        </div>
      </Container>
    </div>
  )
}

/** Switches the replay to another recorded run. Keeps playing if a run was already underway. */
function RecordingSelect({ gallery, status }) {
  const underway = status === 'playing' || status === 'paused' || status === 'checkpoint' || status === 'ended'
  return (
    <span className="relative min-w-0 flex-1 lg:max-w-[26rem]">
      <select
        id="replay-recording"
        value={gallery.selected}
        onChange={(e) => gallery.choose(e.target.value, { play: underway })}
        className="h-8 w-full min-w-0 appearance-none truncate rounded-md border border-line bg-canvas pr-8 pl-2.5 text-[14px] font-medium text-ink transition-colors duration-200 hover:border-accent"
      >
        {gallery.list.map((r) => (
          <option key={r.name} value={r.name}>
            {r.title || r.name}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
    </span>
  )
}
