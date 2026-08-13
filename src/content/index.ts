// Copyright © 2026 Jalapeno Labs
//
// Content script entry point. GitHub renders pull requests as a single-page app driven by
// Turbo, so a one-shot DOM pass is not enough: the page mutates as the user navigates
// between the Conversation and Files tabs without a full reload. We therefore re-run the
// (idempotent) enhancements whenever the DOM settles after a mutation.

// Core
import { LOG_PREFIX } from '../constants'
import { VIEWED_TOGGLE_SELECTOR, VIEWED_TOGGLE_STATE_ATTRIBUTE } from './githubSelectors'

// User interface
import { relocateMergePanel, hideTrailingTimelineDivider } from './mergePanel'
import { ensureMergeDock, hideMergeDock } from './mergeDock'
import { renderPdfPreviews } from './pdfPreview'
import { reserveAccurateDiffHeights } from './diffPlaceholders'
import { markViewedFilesInTree, rollUpViewedDirectories, syncViewedRowForToggle } from './fileTreeViewedState'

const PULL_CONVERSATION_PATTERN = /^\/[^/]+\/[^/]+\/pull\/\d+\/?$/
// The classic diff UI lives at /files; the modern React UI lives at /changes.
const PULL_FILES_PATTERN = /^\/[^/]+\/[^/]+\/pull\/\d+\/(files|changes)\/?$/

// The Files tab enhancements each sweep the whole diff column, which on a several-hundred
// file pull request is a few milliseconds of tree walking. GitHub mutates that column
// constantly while you interact with it, so sweeping once per mutation frame would itself
// become a source of the jank we are here to remove. Files only appear as GitHub streams
// more of the pull request in, so a lazier cadence costs nothing you can perceive.
const FILES_SCAN_INTERVAL_MS = 400

function runEnhancements() {
  const pathname = window.location.pathname

  if (PULL_CONVERSATION_PATTERN.test(pathname)) {
    // The trailing timeline divider only looks out of place once the merge box has moved,
    // so only clean it up when we actually relocated the box.
    if (relocateMergePanel()) {
      hideTrailingTimelineDivider()
    }
    ensureMergeDock()
  }
  else {
    hideMergeDock()
  }

  if (PULL_FILES_PATTERN.test(pathname)) {
    scheduleFilesScan()
  }
}

let lastFilesScanAt = 0
let trailingFilesScan = 0

function scheduleFilesScan() {
  const sinceLastScan = performance.now() - lastFilesScanAt
  if (sinceLastScan >= FILES_SCAN_INTERVAL_MS) {
    runFilesScan()
    return
  }

  // Always leave one run queued behind a burst, so the mutation arriving just inside the
  // interval is swept a moment later rather than dropped.
  if (!trailingFilesScan) {
    trailingFilesScan = window.setTimeout(runFilesScan, FILES_SCAN_INTERVAL_MS - sinceLastScan)
  }
}

function runFilesScan() {
  window.clearTimeout(trailingFilesScan)
  trailingFilesScan = 0
  lastFilesScanAt = performance.now()

  // A queued trailing scan can outlive a Turbo navigation away from the Files tab.
  if (!PULL_FILES_PATTERN.test(window.location.pathname)) {
    return
  }

  reserveAccurateDiffHeights()
  markViewedFilesInTree()
  rollUpViewedDirectories()
  renderPdfPreviews()
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

const structureObserver = new MutationObserver(scheduleRun)
structureObserver.observe(document.body, { childList: true, subtree: true })

// Marking a file viewed flips `aria-pressed` on its toggle and nothing else we watch, so the
// structural observer above never hears about it. Watching that one attribute lets the
// sidebar answer on the spot rather than waiting out the scan interval, which is far too
// slow to acknowledge a click the user just made.
const viewedObserver = new MutationObserver((records) => {
  let didSyncAnyRow = false

  for (const record of records) {
    if (record.target instanceof HTMLElement && record.target.matches(VIEWED_TOGGLE_SELECTOR)) {
      syncViewedRowForToggle(record.target)
      didSyncAnyRow = true
    }
  }

  // Roll up once for the whole batch rather than once per file, since marking the last file in
  // a folder is exactly the moment its parents finish too.
  if (didSyncAnyRow) {
    rollUpViewedDirectories()
  }
})
viewedObserver.observe(document.body, {
  subtree: true,
  attributes: true,
  attributeFilter: [VIEWED_TOGGLE_STATE_ATTRIBUTE]
})

console.debug(LOG_PREFIX, 'Content script initialized')
runEnhancements()
