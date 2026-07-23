const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
const BACKEND_PORT = process.env.NEXT_PUBLIC_BACKEND_PORT || process.env.BACKEND_PORT || '8001'

function buildUrl(path: string): string {
  // direct backend mode: call cross-origin if NEXT_PUBLIC_BACKEND_URL is set
  if (BACKEND_URL) {
    return `${BACKEND_URL}${path}`
  }
  // local development with caddy gateway: route using XTransformPort
  if (process.env.NEXT_PUBLIC_BACKEND_PORT) {
    const sep = path.includes('?') ? '&' : '?'
    return `${path}${sep}XTransformPort=${BACKEND_PORT}`
  }
  // production proxy mode: return relative path for same-origin Vercel rewrites proxy
  return path
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

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(buildUrl(path), {
    headers: getHeaders(null),
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function apiPost<T = any>(path: string, body?: any): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: 'POST',
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })
  if (res.ok && path.includes('/auth/logout')) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('tc_token')
    }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || data.message || `API error ${res.status}`)
  }
  const data = await res.json()
  if (data && data.token && typeof window !== 'undefined') {
    localStorage.setItem('tc_token', data.token)
  }
  return data
}

export async function apiPatch<T = any>(path: string, body?: any): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: 'PATCH',
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || data.message || `API error ${res.status}`)
  }
  return res.json()
}

export async function apiPut<T = any>(path: string, body?: any): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: 'PUT',
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || data.message || `API error ${res.status}`)
  }
  return res.json()
}

export async function apiDelete<T = any>(path: string): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: 'DELETE',
    headers: getHeaders(null),
    credentials: 'include',
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || data.message || `API error ${res.status}`)
  }
  return res.json()
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

// upload blob as multipart; browser sets the boundary (don't set content-type)
// throws server message on 413/507 so caller can toast it
export async function apiUploadFile(
  path: string,
  file: Blob,
  opts?: { contentType?: string; fileName?: string },
): Promise<UploadResult> {
  const formData = new FormData()
  const fileName = opts?.fileName || `upload-${Date.now()}`
  // wrap blob so FormData emits the caller's contentType
  const blob =
    opts?.contentType && !(file instanceof File)
      ? new Blob([file], { type: opts.contentType })
      : file
  formData.append('file', blob, fileName)

  const res = await fetch(buildUrl(path), {
    method: 'POST',
    body: formData,
    headers: getHeaders(null),
    credentials: 'include',
  })

  const data = await res.json().catch(() => ({} as UploadResult))

  if (!res.ok) {
    const serverMsg =
      (data as any).message ||
      (data as any).error ||
      (data as any).detail ||
      `Upload failed (HTTP ${res.status})`
    throw new Error(serverMsg)
  }

  return data as UploadResult
}
