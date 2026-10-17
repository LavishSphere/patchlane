import { FileCode } from 'lucide-react'
import { useMemo } from 'react'
import { diffStats, parseDiff } from '../utils/diff'
import { plural } from '../utils/format'
import { CardHeader } from './ui'

const ROW = {
  add: { row: 'bg-diff-add', gutter: 'bg-diff-add-gutter', sign: '+', signColor: 'text-healthy' },
  del: { row: 'bg-diff-del', gutter: 'bg-diff-del-gutter', sign: '−', signColor: 'text-incident' },
  ctx: { row: 'bg-white', gutter: 'bg-white', sign: ' ', signColor: '' },
  note: { row: 'bg-white', gutter: 'bg-white', sign: ' ', signColor: '' },
}

/** GitHub-style unified diff of Droid's patch. */
export default function DiffViewer({ diff }) {
  const files = useMemo(() => parseDiff(diff), [diff])
  const stats = diffStats(files)

  return (
    <section aria-labelledby="diff-title" className="card overflow-hidden p-0">
      <div className="px-5 py-5 sm:px-6">
        <CardHeader
          id="diff-title"
          eyebrow="The patch"
          title="Droid’s diff"
          aside={
            files.length > 0 && (
              <p className="num text-[15px] text-muted">
                {plural(stats.files, 'file')} · <span className="font-medium text-healthy">+{stats.additions}</span>{' '}
                <span className="font-medium text-incident">−{stats.deletions}</span>
              </p>
            )
          }
        />
        <p className="mt-2 text-[15px] text-muted">
          Taken from the agent sandbox with git. This exact change, and nothing else, is what the clean sandbox verified.
        </p>
      </div>

      {files.length === 0 ? (
        <p className="border-t border-line px-6 py-5 text-[15px] text-muted">No source changes.</p>
      ) : (
        files.map((file) => (
          <div key={file.newPath} className="border-t border-line">
            <div className="flex items-center justify-between gap-3 bg-subtle px-4 py-2.5 sm:px-6">
              <p className="flex min-w-0 items-center gap-2 font-mono text-[14px] text-ink">
                <FileCode className="size-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="truncate">{file.newPath}</span>
              </p>
              <p className="num shrink-0 font-mono text-[13px]">
                <span className="text-healthy">+{file.additions}</span> <span className="text-incident">−{file.deletions}</span>
              </p>
            </div>
            <div className="scroll-quiet overflow-x-auto">
              <table className="w-full border-collapse font-mono text-[14px] leading-[1.75] lg:text-[15px]">
                <caption className="sr-only">Changes to {file.newPath}</caption>
                <tbody>
                  {file.hunks.map((hunk, h) => (
                    <HunkRows key={`${file.newPath}-${h}`} hunk={hunk} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </section>
  )
}

function HunkRows({ hunk }) {
  return (
    <>
      <tr className="bg-diff-hunk">
        <td colSpan={4} className="px-4 py-1 text-[13px] whitespace-pre text-muted sm:px-6">
          {hunk.header}
        </td>
      </tr>
      {hunk.lines.map((line, i) => {
        const s = ROW[line.kind]
        const label = line.kind === 'add' ? 'added' : line.kind === 'del' ? 'removed' : undefined
        return (
          <tr key={i} className={s.row}>
            <td className={`w-12 min-w-12 px-2 text-right align-top text-[12.5px] text-faint select-none ${s.gutter}`}>
              {line.oldNo ?? ''}
            </td>
            <td className={`w-12 min-w-12 px-2 text-right align-top text-[12.5px] text-faint select-none ${s.gutter}`}>
              {line.newNo ?? ''}
            </td>
            <td className={`w-6 pl-2 align-top select-none ${s.signColor}`} aria-hidden="true">
              {s.sign}
            </td>
            <td className="pr-6 whitespace-pre text-ink">
              {label && <span className="sr-only">{label}: </span>}
              {line.text || ' '}
            </td>
          </tr>
        )
      })}
    </>
  )
}
