// Copyright © 2026 Jalapeno Labs
//
// Runs inside the extension-origin `viewer.html` iframe that the content script embeds in a
// PDF diff. Because this page runs in the extension's own origin (not github.com), it can:
//   1. Fetch the raw PDF bytes cross-origin, carrying the user's GitHub cookies, which makes
//      previews work for private repositories.
//   2. Hand those bytes to Chrome's built-in PDF viewer via a `blob:` URL, free of the
//      github.com Content-Security-Policy that would block embedding the document directly.

import { LOG_PREFIX, ALLOWED_PDF_HOST_PATTERN } from '../constants'

async function renderPdf() {
  const message = document.getElementById('message')
  const fileUrl = new URLSearchParams(window.location.search).get('file')

  if (!fileUrl) {
    console.debug(LOG_PREFIX, 'Viewer opened without a "file" parameter')
    showMessage(message, 'No PDF file was provided.')
    return
  }

  // The viewer fetches with credentials, so it must never be pointed at an arbitrary host.
  const parsedUrl = parseAllowedUrl(fileUrl)
  if (!parsedUrl) {
    console.debug(LOG_PREFIX, 'Viewer refused a disallowed file URL', fileUrl)
    showMessage(message, 'This PDF is hosted somewhere the preview does not trust.')
    return
  }

  try {
    const response = await fetch(parsedUrl.toString(), { credentials: 'include' })
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`)
    }

    // GitHub may serve the raw bytes as octet-stream; force the PDF media type so the
    // browser renders the document instead of offering to download it.
    const sourceBlob = await response.blob()
    const pdfBlob = sourceBlob.type === 'application/pdf'
      ? sourceBlob
      : new Blob([sourceBlob], { type: 'application/pdf' })

    window.location.replace(URL.createObjectURL(pdfBlob))
  }
  catch (error) {
    console.debug(LOG_PREFIX, 'Failed to load PDF in viewer', fileUrl, error)
    showMessage(message, 'Could not load this PDF. Open it with the "View file" menu instead.')
  }
}

function parseAllowedUrl(fileUrl: string): URL | null {
  try {
    const parsedUrl = new URL(fileUrl)
    if (parsedUrl.protocol !== 'https:' || !ALLOWED_PDF_HOST_PATTERN.test(parsedUrl.hostname)) {
      return null
    }
    return parsedUrl
  }
  catch (error) {
    console.debug(LOG_PREFIX, 'Viewer received an unparseable file URL', fileUrl, error)
    return null
  }
}

function showMessage(element: HTMLElement | null, text: string) {
  if (!element) {
    console.debug(LOG_PREFIX, 'Viewer message element is missing', text)
    return
  }
  element.textContent = text
}

renderPdf()
