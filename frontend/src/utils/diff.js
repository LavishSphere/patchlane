/**
 * Parse a unified git diff into files → hunks → lines with line numbers.
 * Display only; nothing here decides anything about the patch.
 */
export function parseDiff(text) {
  if (!text) return []
  const files = []
  let file = null
  let hunk = null
  let oldNo = 0
  let newNo = 0

  const rows = text.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n')
  for (const raw of rows) {
    if (raw.startsWith('diff --git ')) {
      const m = raw.match(/^diff --git a\/(.+?) b\/(.+)$/)
      file = { oldPath: m?.[1] ?? '', newPath: m?.[2] ?? '', hunks: [], additions: 0, deletions: 0, meta: [] }
      files.push(file)
      hunk = null
      continue
    }
    if (!file) continue
    if (!hunk) {
      if (raw.startsWith('--- ')) {
        const p = raw.slice(4)
        if (p !== '/dev/null') file.oldPath = p.replace(/^a\//, '')
        else file.isNew = true
        continue
      }
      if (raw.startsWith('+++ ')) {
        const p = raw.slice(4)
        if (p !== '/dev/null') file.newPath = p.replace(/^b\//, '')
        else file.isDeleted = true
        continue
      }
    }
    if (raw.startsWith('@@')) {
      const m = raw.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/)
      oldNo = Number(m?.[1] ?? 0)
      newNo = Number(m?.[3] ?? 0)
      hunk = { header: raw, context: m?.[5] ?? '', lines: [] }
      file.hunks.push(hunk)
      continue
    }
    if (!hunk) {
      file.meta.push(raw)
      continue
    }
    if (raw.startsWith('+')) {
      hunk.lines.push({ kind: 'add', text: raw.slice(1), newNo: newNo++ })
      file.additions++
    } else if (raw.startsWith('-')) {
      hunk.lines.push({ kind: 'del', text: raw.slice(1), oldNo: oldNo++ })
      file.deletions++
    } else if (raw.startsWith('\\')) {
      hunk.lines.push({ kind: 'note', text: raw })
    } else {
      hunk.lines.push({ kind: 'ctx', text: raw.slice(1), oldNo: oldNo++, newNo: newNo++ })
    }
  }
  return files
}

export function diffStats(files) {
  return files.reduce(
    (acc, f) => ({ files: acc.files + 1, additions: acc.additions + f.additions, deletions: acc.deletions + f.deletions }),
    { files: 0, additions: 0, deletions: 0 },
  )
}
