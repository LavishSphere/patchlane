import { History, Pause, Play, RotateCcw } from 'lucide-react'
import { dateTime, duration } from '../utils/format'
import { Container } from './ui'

const SPEEDS = [1, 4]

export default function ReplayBanner({ replay, notice, onRetryLive }) {
  const { status, position, duration: total, startedAt, speed } = replay
  const ready = status !== 'loading' && status !== 'error'
  const playing = status === 'playing'
  const progress = total ? Math.min(100, (position / total) * 100) : 0

  return (
    <div role="region" aria-label="Replay" className="border-b border-line bg-subtle/95 backdrop-blur">
      <Container className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2.5">
        <p className="flex min-w-0 items-center gap-2 text-[14px] text-ink">
          <History className="size-4 shrink-0 text-muted" aria-hidden="true" />
          <span className="font-medium">Replay of recorded run</span>
          <span className="truncate text-muted">
            · {status === 'error' ? 'recording unavailable' : startedAt ? dateTime(startedAt) : 'loading…'}
          </span>
        </p>

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

        <div className="flex w-full items-center gap-3 sm:ml-auto sm:w-auto">
          <button
            type="button"
            onClick={playing ? replay.pause : replay.play}
            disabled={!ready}
            aria-label={playing ? 'Pause replay' : 'Play replay'}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-canvas transition-opacity hover:bg-black disabled:opacity-40"
          >
            {playing ? <Pause className="size-3.5" fill="currentColor" /> : <Play className="size-3.5 translate-x-px" fill="currentColor" />}
          </button>

          <input
            type="range"
            className="scrubber min-w-0 flex-1 sm:w-48 sm:flex-none lg:w-64"
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

          <div role="group" aria-label="Replay speed" className="flex shrink-0 rounded-full border border-line bg-white p-0.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => replay.setSpeed(s)}
                aria-pressed={speed === s}
                className={`num h-7 rounded-full px-2.5 text-[13px] font-medium transition-colors ${
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
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-white hover:text-ink disabled:opacity-40"
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
