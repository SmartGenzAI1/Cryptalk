const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
const BACKEND_PORT = process.env.NEXT_PUBLIC_BACKEND_PORT || process.env.BACKEND_PORT || '8001'

function buildUrl(path: string): string {
  if (BACKEND_URL) {
    const sep = path.includes('?') ? '&' : '?'
    return `${BACKEND_URL}${path}${sep}`
  }
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}XTransformPort=${BACKEND_PORT}`
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(buildUrl(path), { credentials: 'include' })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function apiPost<T = any>(path: string, body?: any): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || data.message || `API error ${res.status}`)
  }
  return res.json()
}

export async function apiPatch<T = any>(path: string, body?: any): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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

/**
 * Upload a binary blob to the backend as multipart/form-data with field name `file`.
 * The browser sets the Content-Type + multipart boundary automatically — do NOT
 * set Content-Type manually or the boundary will be missing.
 *
 * On 413 / 507 the server returns `{ error, message | limit | quota }`. We throw
 * an Error whose `.message` contains the human-readable server message so the
 * caller can show it in a toast.
 */
export async function apiUploadFile(
  path: string,
  file: Blob,
  opts?: { contentType?: string; fileName?: string },
): Promise<UploadResult> {
  const formData = new FormData()
  const fileName = opts?.fileName || `upload-${Date.now()}`
  // If the caller supplied a contentType, wrap the blob so FormData emits it.
  const blob =
    opts?.contentType && !(file instanceof File)
      ? new Blob([file], { type: opts.contentType })
      : file
  formData.append('file', blob, fileName)

  const res = await fetch(buildUrl(path), {
    method: 'POST',
    body: formData,
    credentials: 'include',
    // Intentionally omit 'Content-Type' — the browser must set the multipart boundary.
  })

  const data = await res.json().catch(() => ({} as UploadResult))

  if (!res.ok) {
    // 413 file_too_large, 507 quota_exceeded, etc.
    const serverMsg =
      (data as any).message ||
      (data as any).error ||
      (data as any).detail ||
      `Upload failed (HTTP ${res.status})`
    throw new Error(serverMsg)
  }

  return data as UploadResult
}

export { BACKEND_PORT, BACKEND_URL }
