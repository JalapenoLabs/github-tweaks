// Copyright © 2026 Jalapeno Labs

import type { Project } from '../api/routes'

import { describeAge } from '../lib/dates'
import { formatBytes, truncateMiddle } from '../lib/format'

type CardProps = {
  project: Project
  now: Date
  onOpen: (projectId: string) => void
}

export function Card({ project, now, onOpen }: CardProps) {
  return (
    <article className="rounded-lg border border-slate-200 p-4">
      <h3 className="font-medium" title={project.name}>
        {truncateMiddle(project.name, 40)}
      </h3>
      <dl className="mt-2 flex gap-4 text-sm text-slate-500">
        <div>
          <dt className="sr-only">Last updated</dt>
          <dd>{describeAge(new Date(project.updatedAt), now)}</dd>
        </div>
        <div>
          <dt className="sr-only">Size</dt>
          <dd>{formatBytes(project.sizeInBytes)}</dd>
        </div>
      </dl>
      <button className="mt-3 text-emerald-700" onClick={() => onOpen(project.id)}>
        Open project
      </button>
    </article>
  )
}
