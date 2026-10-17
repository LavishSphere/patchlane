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

  // Operator-only. Never called while replaying.
  trigger: (token, caseId) => request('/api/demo/trigger', { method: 'POST', token, body: caseId ? { caseId } : {} }),
  reset: (token) => request('/api/demo/reset', { method: 'POST', token }),
  investigate: (token, id) => request(`/api/incidents/${encodeURIComponent(id)}/investigate`, { method: 'POST', token }),
  approve: (token, id) => request(`/api/incidents/${encodeURIComponent(id)}/approve`, { method: 'POST', token }),
  reject: (token, id) => request(`/api/incidents/${encodeURIComponent(id)}/reject`, { method: 'POST', token }),
}

export function eventsUrl(id) {
  return `${API_BASE}/api/incidents/${encodeURIComponent(id)}/events`
}

/** The golden recording: from the API, else the copy bundled with the site. */
export async function loadRecording(name = 'golden') {
  try {
    const res = await fetchText(`${API_BASE}/api/recordings/${name}`, 3500)
    return { text: res, source: 'api' }
  } catch {
    const text = await fetchText(`${import.meta.env.BASE_URL}recordings/${name}.jsonl`, 8000)
    return { text, source: 'bundled' }
  }
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
