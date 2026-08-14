// Copyright © 2026 Jalapeno Labs

import { request } from './client'

export type Project = {
  id: string
  name: string
  updatedAt: string
  sizeInBytes: number
}

type ListProjectsResponse = {
  projects: Project[]
  nextCursor: string | null
}

// Each route is its own function returning its own response type, so this file is the source
// of truth for the contract rather than a wrapper that hides it.
export function listProjects(cursor?: string) {
  const query = cursor
    ? `?cursor=${encodeURIComponent(cursor)}`
    : ''

  return request<ListProjectsResponse>(`projects${query}`)
}

export function getProject(projectId: string) {
  return request<{ project: Project }>(`projects/${projectId}`)
}
