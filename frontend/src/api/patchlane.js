// Every network call goes through here, against VITE_API_BASE_URL.

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '')

const TOKEN_KEY = 'patchlane.operatorToken'

export const operatorToken = {
  get() {
    try {
      return window.sessionStorage.getItem(TOKEN_KEY) || null
    } catch {
      return null
    }
  },
  set(token) {
    try {
      window.sessionStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* storage unavailable: the token lives only in memory for this page */
    }
  },
  clear() {
    try {
      window.sessionStorage.removeItem(TOKEN_KEY)
    } catch {
      /* nothing to clear */
    }
  },
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function request(path, { method = 'GET', token, body, timeout = 8000, signal } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  signal?.addEventListener('abort', () => controller.abort())
  try {
    const headers = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      let message = `${res.status} ${res.statusText}`
      try {
        const data = await res.json()
        if (data?.detail) message = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
      } catch {
        /* not JSON */
      }
      throw new ApiError(res.status, message)
    }
    if (res.status === 204) return null
    const text = await res.text()
    return text ? JSON.parse(text) : null
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  currentIncident: (opts) => request('/api/incidents/current', opts),
  incident: (id, opts) => request(`/api/incidents/${encodeURIComponent(id)}`, opts),
  benchmark: (opts) => loadBenchmark(opts),
  cases: (opts) => request('/api/cases', opts),
  pairs: (opts) => request('/api/pairs', opts),

  // Checks a token without changing anything: resolves on 204, throws ApiError(401) for a wrong token.
  checkToken: (token) => request('/api/demo/session', { token, timeout: 6000 }),

  // Operator-only. Never called while replaying.
  trigger: (token, choice) => request('/api/demo/trigger', { method: 'POST', token, body: triggerBody(choice) }),
  reset: (token) => request('/api/demo/reset', { method: 'POST', token }),
  investigate: (token, id) => request(`/api/incidents/${encodeURIComponent(id)}/investigate`, { method: 'POST', token }),
  approve: (token, id) => request(`/api/incidents/${encodeURIComponent(id)}/approve`, { method: 'POST', token }),
  reject: (token, id) => request(`/api/incidents/${encodeURIComponent(id)}/reject`, { method: 'POST', token }),
}

const TRIGGER_KEYS = ['caseId', 'variantId', 'secondCaseId', 'secondVariantId']

/**
 * The body for POST /api/demo/trigger: caseId and variantId, plus secondCaseId
 * and secondVariantId for two bugs at once. Null values are left out.
 */
function triggerBody(choice = {}) {
  const body = {}
  for (const key of TRIGGER_KEYS) if (choice[key] != null) body[key] = choice[key]
  return body
}

export function eventsUrl(id) {
  return `${API_BASE}/api/incidents/${encodeURIComponent(id)}/events`
}

/** A recording by name: from the API, else the copy bundled with the site. */
export async function loadRecording(name = 'golden') {
  const file = encodeURIComponent(name)
  try {
    const res = await fetchText(`${API_BASE}/api/recordings/${file}`, 3500)
    return { text: res, source: 'api' }
  } catch {
    const text = await fetchText(`${import.meta.env.BASE_URL}recordings/${file}.jsonl`, 8000)
    return { text, source: 'bundled' }
  }
}

const RECORDING_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/

/**
 * The list of bundled recordings (public/recordings/index.json). Entries
 * without a usable name are dropped. Throws when the file is missing.
 */
export async function loadRecordingIndex() {
  const text = await fetchText(`${import.meta.env.BASE_URL}recordings/index.json`, 6000)
  const list = JSON.parse(text)
  if (!Array.isArray(list)) throw new Error('The recording index is not a list')
  const seen = new Set()
  return list.filter((entry) => {
    const ok = typeof entry?.name === 'string' && RECORDING_NAME.test(entry.name) && !seen.has(entry.name)
    if (ok) seen.add(entry.name)
    return ok
  })
}

/** The latest benchmark: from the API, else the published copy bundled with the site. */
async function loadBenchmark(opts) {
  let fromApi = null
  try {
    fromApi = await request('/api/benchmark/latest', opts)
    if (fromApi?.available) return fromApi
  } catch {
    /* API unreachable: try the bundled copy */
  }
  try {
    const text = await fetchText(`${import.meta.env.BASE_URL}benchmark/latest.json`, 8000)
    return { ...JSON.parse(text), available: true, source: 'bundled' }
  } catch (error) {
    if (fromApi) return fromApi // the API answered "not run yet" and nothing is bundled
    throw error
  }
}

async function fetchText(url, timeout) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}
