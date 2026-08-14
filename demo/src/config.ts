// Copyright © 2026 Jalapeno Labs

export const Config = {
  apiBasePath: '/api/v1',
  pageSize: 25,
  // Long enough that a slow network still lands, short enough that a hung request does not
  // hold a spinner on screen indefinitely.
  requestTimeoutMs: 10_000,
  maxProjectNameLength: 64
} as const

export type ConfigValue = typeof Config[keyof typeof Config]
