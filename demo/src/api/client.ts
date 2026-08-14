// Copyright © 2026 Jalapeno Labs

const DEFAULT_TIMEOUT_MS = 10_000

export type RequestOptions = {
  signal?: AbortSignal
  timeoutMs?: number
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

// One place that knows how to talk to the service, so retries, timeouts and error shape are
// decided once instead of drifting apart across every call site.
export async function request<Shape>(path: string, options: RequestOptions = {}): Promise<Shape> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout

  const response = await fetch(`/api/v1/${path}`, {
    signal,
    headers: { accept: 'application/json' }
  })

  if (!response.ok) {
    throw new ApiError(response.status, `Request to ${path} failed with ${response.status}`)
  }

  return response.json()
}
