// Copyright © 2026 Jalapeno Labs
//
// Content script entry point. GitHub renders pull requests as a single-page app driven by
// Turbo, so a one-shot DOM pass is not enough: the page mutates as the user navigates
// between the Conversation and Files tabs without a full reload. We therefore re-run the
// (idempotent) enhancements whenever the DOM settles after a mutation.

// Core
import { LOG_PREFIX } from '../constants'

// User interface
import { relocateMergePanel, hideTrailingTimelineDivider } from './mergePanel'
import { renderPdfPreviews } from './pdfPreview'

const PULL_CONVERSATION_PATTERN = /^\/[^/]+\/[^/]+\/pull\/\d+\/?$/
// The classic diff UI lives at /files; the modern React UI lives at /changes.
const PULL_FILES_PATTERN = /^\/[^/]+\/[^/]+\/pull\/\d+\/(files|changes)\/?$/

function runEnhancements() {
  const pathname = window.location.pathname

  if (PULL_CONVERSATION_PATTERN.test(pathname)) {
    // The trailing timeline divider only looks out of place once the merge box has moved,
    // so only clean it up when we actually relocated the box.
    if (relocateMergePanel()) {
      hideTrailingTimelineDivider()
    }
  }

  if (PULL_FILES_PATTERN.test(pathname)) {
    renderPdfPreviews()
  }
}

// Coalesce the flurry of mutations GitHub emits while streaming a page into a single run
// per animation frame. Our own insertions trigger more mutations, but the enhancement
// functions are idempotent, so the loop converges after one extra no-op frame.
let scheduledFrame = 0
function scheduleRun() {
  if (scheduledFrame) {
    return
  }

  scheduledFrame = window.requestAnimationFrame(() => {
    scheduledFrame = 0
    runEnhancements()
  })
}

const observer = new MutationObserver(scheduleRun)
observer.observe(document.body, { childList: true, subtree: true })

console.debug(LOG_PREFIX, 'Content script initialized')
runEnhancements()
