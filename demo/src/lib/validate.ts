// Copyright © 2026 Jalapeno Labs

export type ValidationResult = {
  isValid: boolean
  problems: string[]
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// Collects every problem rather than failing on the first. A form that reveals its objections
// one at a time makes the reader submit four times to learn four things.
export function validateSlug(candidate: string): ValidationResult {
  const problems: string[] = []
  const trimmed = candidate.trim()

  if (!trimmed) {
    problems.push('A name is required.')
  }

  if (trimmed.length > 64) {
    problems.push('Names cannot be longer than 64 characters.')
  }

  if (trimmed && !SLUG_PATTERN.test(trimmed)) {
    problems.push('Use lowercase letters, numbers, and single hyphens between them.')
  }

  return { isValid: !problems.length, problems }
}
