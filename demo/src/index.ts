// Copyright © 2026 Jalapeno Labs
//
// Entry point for the example service. This directory exists to give the extension a
// realistic file tree to demonstrate against; nothing here is built or shipped.

export { request, ApiError } from './api/client'
export { listProjects, getProject } from './api/routes'
export type { Project } from './api/routes'

export { Button } from './components/Button'
export { Card } from './components/Card'

export { describeAge } from './lib/dates'
export { formatBytes, truncateMiddle } from './lib/format'
export { validateSlug } from './lib/validate'
