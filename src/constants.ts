// Copyright © 2026 Jalapeno Labs

// Prefix for every console message the extension emits, so its logs are easy to filter.
export const LOG_PREFIX = '[GitHub PR Enhancer]'

// Marker attributes that make the DOM mutations idempotent. GitHub navigates with Turbo
// and streams content in, so our enhancement functions run many times; these markers let
// them recognise work they have already done and skip it.
export const RELOCATED_MARKER = 'data-pr-enhancer-relocated'
export const PDF_PROCESSED_MARKER = 'data-pr-enhancer-pdf'
export const HIDDEN_DIVIDER_MARKER = 'data-pr-enhancer-divider-hidden'

// Mirrors a file's "Viewed" toggle onto its row in the file tree sidebar. We mark with an
// attribute rather than a class because React owns `className` on those rows and rewrites it
// on every re-render; it leaves attributes it never set alone.
export const VIEWED_TREE_ROW_MARKER = 'data-pr-enhancer-viewed'

// Only these hosts may be fetched by the viewer page, which sends the user's GitHub
// cookies. Restricting the origin prevents the viewer from being abused as a credentialed
// fetch proxy for arbitrary URLs.
export const ALLOWED_PDF_HOST_PATTERN = /(^|\.)github\.com$|(^|\.)githubusercontent\.com$/
