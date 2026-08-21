const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
const BACKEND_PORT = process.env.NEXT_PUBLIC_BACKEND_PORT || process.env.BACKEND_PORT || '8001'

let _onUnauthorized: (() => void) | null = null
export function setOnUnauthorized(fn: (() => void) | null) {
  _onUnauthorized = fn
}

function buildUrl(path: string): string {
  let url: string
  if (BACKEND_URL) {
    url = `${BACKEND_URL}${path}`
  } else if (process.env.NEXT_PUBLIC_BACKEND_PORT) {
    const sep = path.includes('?') ? '&' : '?'
    url = `${path}${sep}XTransformPort=${BACKEND_PORT}`
  } else {
    url = path
  }
  // Enforce HTTPS in production
  if (process.env.NODE_ENV === 'production' && url.startsWith('http://')) {
    url = url.replace(/^http:\/\//, 'https://')
  }
  return url
}

function getHeaders(contentType: string | null = 'application/json') {
  const headers: Record<string, string> = {}
  if (contentType) {
    headers['Content-Type'] = contentType
  }
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('tc_token')
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }
  return headers
}

function makeTimeoutController(timeoutMs: number = 30000) {
  if (typeof AbortController === 'undefined') return { signal: undefined, cleanup: () => {} }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) }
}

function handleAuthError(status: number) {
  if (status === 401 || status === 403) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('tc_token')
    }
    if (_onUnauthorized) {
      _onUnauthorized()
    } else if (typeof window !== 'undefined') {
      window.location.assign('/')
    }
  }
}

export async function apiGet<T = any>(path: string, timeoutMs: number = 30000): Promise<T> {
  const { signal, cleanup } = makeTimeoutController(timeoutMs)
  try {
    const res = await fetch(buildUrl(path), {
      headers: getHeaders(null),
      credentials: 'same-origin',
      signal,
    })
    if (!res.ok) {
      handleAuthError(res.status)
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || data.message || `API error ${res.status}`)
    }
    return res.json()
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error('Request timed out')
    throw e
  } finally {
    cleanup()
  }
}

export async function apiPost<T = any>(path: string, body?: any, timeoutMs: number = 30000): Promise<T> {
  const { signal, cleanup } = makeTimeoutController(timeoutMs)
  try {
    const res = await fetch(buildUrl(path), {
      method: 'POST',
      headers: getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal,
    })
    if (res.ok && path.includes('/auth/logout')) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('tc_token')
      }
    }
    if (!res.ok) {
      handleAuthError(res.status)
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || data.message || `API error ${res.status}`)
    }
    if (res.status === 204) return undefined as T
    const data = await res.json()
    if (data && data.token && typeof window !== 'undefined') {
      localStorage.setItem('tc_token', data.token)
    }
    return data
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error('Request timed out')
    throw e
  } finally {
    cleanup()
  }
}

export async function apiPatch<T = any>(path: string, body?: any, timeoutMs: number = 30000): Promise<T> {
  const { signal, cleanup } = makeTimeoutController(timeoutMs)
  try {
    const res = await fetch(buildUrl(path), {
      method: 'PATCH',
      headers: getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal,
    })
    if (!res.ok) {
      handleAuthError(res.status)
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || data.message || `API error ${res.status}`)
    }
    if (res.status === 204) return undefined as T
    return res.json()
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error('Request timed out')
    throw e
  } finally {
    cleanup()
  }
}

export async function apiPut<T = any>(path: string, body?: any, timeoutMs: number = 30000): Promise<T> {
  const { signal, cleanup } = makeTimeoutController(timeoutMs)
  try {
    const res = await fetch(buildUrl(path), {
      method: 'PUT',
      headers: getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal,
    })
    if (!res.ok) {
      handleAuthError(res.status)
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || data.message || `API error ${res.status}`)
    }
    if (res.status === 204) return undefined as T
    return res.json()
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error('Request timed out')
    throw e
  } finally {
    cleanup()
  }
}

export async function apiDelete<T = any>(path: string, timeoutMs: number = 30000): Promise<T> {
  const { signal, cleanup } = makeTimeoutController(timeoutMs)
  try {
    const res = await fetch(buildUrl(path), {
      method: 'DELETE',
      headers: getHeaders(null),
      credentials: 'same-origin',
      signal,
    })
    if (!res.ok) {
      handleAuthError(res.status)
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || data.message || `API error ${res.status}`)
    }
    if (res.status === 204) return undefined as T
    return res.json()
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error('Request timed out')
    throw e
  } finally {
    cleanup()
  }
}

export interface UploadResult {
  url?: string
  path?: string
  size?: number
  contentType?: string
  fileName?: string
  fallback?: boolean
  message?: string
}

export interface UploadProgress {
  loaded: number
  total: number
  percent: number
}

export async function apiUploadFile(
  path: string,
  file: Blob,
  opts?: { contentType?: string; fileName?: string; onProgress?: (p: UploadProgress) => void },
): Promise<UploadResult> {
  const formData = new FormData()
  const fileName = opts?.fileName || `upload-${Date.now()}`
  const blob =
    opts?.contentType && !(file instanceof File)
      ? new Blob([file], { type: opts.contentType })
      : file
  formData.append('file', blob, fileName)

  if (opts?.onProgress && typeof XMLHttpRequest !== 'undefined') {
    return new Promise<UploadResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', buildUrl(path), true)

      const token = typeof window !== 'undefined' ? localStorage.getItem('tc_token') : null
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      }

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          opts.onProgress!({ loaded: e.loaded, total: e.total, percent: Math.round((e.loaded / e.total) * 100) })
        }
      }

      xhr.onload = () => {
        let data: UploadResult = {}
        try { data = JSON.parse(xhr.responseText) } catch {}
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data)
        } else {
          handleAuthError(xhr.status)
          const msg = (data as any).message || (data as any).error || (data as any).detail || `Upload failed (HTTP ${xhr.status})`
          reject(new Error(msg))
        }
      }

      xhr.onerror = () => reject(new Error('Upload failed (network error)'))
      xhr.ontimeout = () => reject(new Error('Upload timed out'))
      xhr.timeout = 120000
      xhr.send(formData)
    })
  }

  const res = await fetch(buildUrl(path), {
    method: 'POST',
    body: formData,
    headers: getHeaders(null),
    credentials: 'same-origin',
  })

  const data = await res.json().catch(() => ({} as UploadResult))

  if (!res.ok) {
    handleAuthError(res.status)
    const serverMsg =
      (data as any).message ||
      (data as any).error ||
      (data as any).detail ||
      `Upload failed (HTTP ${res.status})`
    throw new Error(serverMsg)
  }

  return data as UploadResult
}
