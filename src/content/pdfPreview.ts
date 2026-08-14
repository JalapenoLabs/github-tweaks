// Copyright © 2026 Jalapeno Labs
//
// Replaces GitHub's "Binary file not shown." placeholder for PDF diffs with an inline
// preview of the new version of the file, on the modern React-based "Files changed" UI.
//
// Why an extension-origin iframe instead of a plain `<embed src="blob:...">`?
// github.com ships a strict Content-Security-Policy that blocks `blob:` and cross-origin
// documents from being framed/embedded directly in the page. An iframe pointing at one of
// the extension's own web-accessible resources is exempt from the page CSP, so we hand the
// rendering off to `viewer.html`, which fetches the bytes and feeds Chrome's native PDF
// viewer. The viewer fetch runs in the extension origin, so it also works for private
// repositories (it carries the user's GitHub session cookies and bypasses CORS).
//
// The modern UI gives us no raw/blob link in the diff, so we reconstruct the raw file URL
// from the head commit details that GitHub embeds in the page as JSON, plus the file path
// shown in the diff header.

import { DIRECTIONAL_MARKS_PATTERN, LOG_PREFIX, PDF_PROCESSED_MARKER } from '../constants'

// The exact text GitHub renders in the body of a binary diff it will not display.
const BINARY_NOTICE_TEXT = 'Binary file not shown.'
const PREVIEW_HEIGHT_PX = 800

type HeadRefs = {
  owner: string
  repo: string
  sha: string
}

export function renderPdfPreviews() {
  // The placeholder for every binary file carries `data-diff-anchor="<container id>"`.
  const noticeElements = document.querySelectorAll<HTMLElement>('[data-diff-anchor]')

  for (const notice of noticeElements) {
    if (notice.textContent?.trim() !== BINARY_NOTICE_TEXT) {
      continue
    }

    const body = notice.parentElement
    if (!body || body.getAttribute(PDF_PROCESSED_MARKER) === 'true') {
      continue
    }

    const diffAnchor = notice.getAttribute('data-diff-anchor')
    if (!diffAnchor) {
      continue
    }

    const container = document.getElementById(diffAnchor)
    if (!container) {
      console.debug(LOG_PREFIX, 'Could not find the diff container for a binary file', diffAnchor)
      continue
    }

    const path = extractFilePath(container, diffAnchor)
    if (!path.toLowerCase().endsWith('.pdf')) {
      continue
    }

    const refs = getHeadRefs()
    if (!refs) {
      console.debug(LOG_PREFIX, 'Could not determine the pull request head ref; skipping PDF preview', path)
      continue
    }

    // Hide (rather than remove) GitHub's placeholder and append our own preview. Leaving
    // React's own nodes in place avoids the "removeChild" reconciliation crashes that come
    // from deleting nodes the framework still believes it owns.
    body.setAttribute(PDF_PROCESSED_MARKER, 'true')
    notice.style.display = 'none'
    body.appendChild(buildPreview(buildRawUrl(refs, path)))

    console.debug(LOG_PREFIX, 'Rendered inline PDF preview for', path)
  }
}

function extractFilePath(container: HTMLElement, diffAnchor: string): string {
  // The diff header's file-name link points back at its own container anchor; the file path
  // is the code element inside it. Scoping to the container avoids matching the same anchor
  // in the file-tree sidebar.
  const headerLink = container.querySelector(`a[href="#${diffAnchor}"]`)
  const code = headerLink?.querySelector('code') ?? container.querySelector('h3 code')
  const rawText = code?.textContent ?? ''

  return rawText.replace(DIRECTIONAL_MARKS_PATTERN, '').trim()
}

// Reconstructs the raw URL of the new version of the file from the PR head ref:
//   https://github.com/<owner>/<repo>/raw/<headSha>/<path>
// Routing through github.com (rather than raw.githubusercontent.com directly) means the
// viewer's credentialed fetch also resolves files in private repositories.
function buildRawUrl(refs: HeadRefs, path: string): string {
  const encodedPath = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  return `https://github.com/${refs.owner}/${refs.repo}/raw/${refs.sha}/${encodedPath}`
}

function buildPreview(rawUrl: string): HTMLElement {
  const container = document.createElement('div')
  container.className = 'pr-enhancer-pdf'

  const toolbar = document.createElement('div')
  toolbar.className = 'pr-enhancer-pdf-toolbar'

  const openLink = document.createElement('a')
  openLink.href = rawUrl
  openLink.target = '_blank'
  openLink.rel = 'noopener noreferrer'
  openLink.textContent = 'Open PDF in new tab'
  toolbar.appendChild(openLink)

  const frame = document.createElement('iframe')
  frame.className = 'pr-enhancer-pdf-frame'
  frame.height = String(PREVIEW_HEIGHT_PX)
  frame.src = `${chrome.runtime.getURL('viewer.html')}?file=${encodeURIComponent(rawUrl)}`

  container.append(toolbar, frame)
  return container
}

// Parsing GitHub's embedded data is comparatively expensive and the head ref is stable for
// the lifetime of a page, so cache it per pull request (keyed by path) across the many
// idempotent re-runs the MutationObserver triggers.
let cachedRefs: HeadRefs | null = null
let cachedRefsKey = ''

function getHeadRefs(): HeadRefs | null {
  const key = window.location.pathname
  if (cachedRefs && cachedRefsKey === key) {
    return cachedRefs
  }

  const refs = findHeadRefs()
  if (refs) {
    cachedRefs = refs
    cachedRefsKey = key
  }

  return refs
}

function findHeadRefs(): HeadRefs | null {
  const scripts = document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/json"][data-target$="embeddedData"]'
  )

  for (const script of scripts) {
    let data: unknown
    try {
      data = JSON.parse(script.textContent ?? '')
    }
    catch (error) {
      console.debug(LOG_PREFIX, 'Failed to parse an embedded data script', error)
      continue
    }

    const match = findObjectWithKeys(data, ['headSha', 'headRepositoryOwnerLogin', 'headRepositoryName'])
    if (match) {
      return {
        owner: String(match.headRepositoryOwnerLogin),
        repo: String(match.headRepositoryName),
        sha: String(match.headSha)
      }
    }
  }

  return null
}

// Depth-first search for the first plain object that owns every requested key as a string.
// GitHub nests the PR head details deep inside the embedded Relay payload, and one shallow
// object exposes `headSha` alone, so requiring all three keys finds the right object.
function findObjectWithKeys(value: unknown, keys: string[]): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findObjectWithKeys(item, keys)
      if (found) {
        return found
      }
    }
    return null
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (keys.every((key) => typeof record[key] === 'string')) {
      return record
    }

    for (const nested of Object.values(record)) {
      const found = findObjectWithKeys(nested, keys)
      if (found) {
        return found
      }
    }
  }

  return null
}
