const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

/** Cents to dollars. Whole amounts drop the ".00". */
export function money(cents) {
  if (typeof cents !== 'number' || Number.isNaN(cents)) return '—'
  return cents % 100 === 0 ? usdWhole.format(cents / 100) : usd.format(cents / 100)
}

export function toMs(value) {
  if (value == null) return null
  const ms = typeof value === 'number' ? value : Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})

/** "4:31:32 PM" in the viewer's time zone. */
export function clockTime(value) {
  const ms = toMs(value)
  return ms == null ? '—' : timeFmt.format(ms)
}

/** "Oct 17, 2026, 12:31 PM EDT" */
export function dateTime(value) {
  const ms = toMs(value)
  return ms == null ? '—' : dateTimeFmt.format(ms)
}

/** Durations as m:ss (or h:mm:ss). */
export function duration(ms) {
  if (ms == null || Number.isNaN(ms)) return '—'
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** "51.4 s" for short spans, m:ss otherwise. */
export function seconds(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return value < 100 ? `${value.toFixed(1)} s` : duration(value * 1000)
}

export function shortId(id) {
  if (!id) return '—'
  return String(id).split('-')[0].slice(0, 8)
}

export function ratio(a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') return '—'
  return `${a}/${b}`
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

export function pct(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return `${Math.round(value * 100)}%`
}
