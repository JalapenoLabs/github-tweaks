// Copyright © 2026 Jalapeno Labs
//
// Turns the file tree sidebar into the place you track a review from: every row shows whether
// it is done, and lets you say so.
//
// Reading the state: GitHub keeps "Viewed" out of the sidebar entirely, so a long review
// offers no sense of progress without scrolling the diff column to check. The two halves of
// the page share a join key. Every file renders a `diff-<sha of its path>` region carrying the
// real toggle, and the matching tree row wraps a link to that same fragment. Reading the
// toggle rather than tracking clicks also picks up the state GitHub restores from the server
// on load, and anything marked viewed in another tab.
//
// Writing it: the checkmark on each row is a real button, and clicking it clicks the real
// toggles in the diff column. A directory's button stands for everything beneath it. As with
// the merge dock, GitHub keeps sole ownership of what "viewed" means; we only press its
// buttons.
//
// That button is the one node we inject into React's tree, so the sweep re-adds it if React
// ever takes it back. The viewed *state* is still recorded as an attribute rather than a
// class, because React rewrites `className` on every re-render while leaving attributes it
// never set alone.

import {
  LOG_PREFIX,
  PENDING_PRESSES_MARKER,
  REVIEW_LABEL,
  REVIEW_TOGGLE_CLASS,
  UNREVIEW_LABEL,
  VIEWED_TREE_ROW_MARKER
} from '../constants'
import {
  DIFF_REGION_SELECTOR,
  FILE_TREE_CONTENT_SLOT_SELECTOR,
  FILE_TREE_DIRECTORY_SELECTOR,
  FILE_TREE_ITEM_SELECTOR,
  FILE_TREE_ROW_SELECTOR,
  FILE_TREE_TOGGLE_SELECTOR,
  VIEWED_TOGGLE_SELECTOR,
  VIEWED_TOGGLE_STATE_ATTRIBUTE
} from './githubSelectors'

// A tree row's link never changes, so resolving it once keeps the repeated sweeps down to one
// attribute read each.
const anchorsByRow = new WeakMap<HTMLElement, string>()

// Every file path the tree has shown, mapped to its diff anchor. This is a plain Map rather
// than something derived on demand because a collapsed directory unmounts its rows, and
// un-reviewing a finished folder still has to reach the files underneath it.
const anchorsByFilePath = new Map<string, string>()
let cachedTreePathname = ''

// Directories collapse once per completion, not once per sweep. A folder the user reopens to
// re-read stays open, and dropping a directory from this set the moment it goes incomplete
// again lets a later completion collapse it afresh.
const autoCollapsedDirectories = new WeakSet<HTMLElement>()

// Marking a folder is one write per file, and GitHub throttles bursts of writes to a single
// repository. Ten a second is brisk enough to feel deliberate and gentle enough that a two
// hundred file folder does not arrive as a flood.
const PRESS_INTERVAL_MS = 100

// One queue for the whole page, because every press is a write to the same repository. Keyed
// by anchor so the newest intent for a file replaces an older queued one: reviewing a folder
// and then undoing it must leave one press queued rather than two that fight. A Map iterates
// in insertion order, so this is still a queue.
const pendingPresses = new Map<string, boolean>()
const rowsAwaitingPresses = new Set<HTMLElement>()
let isDrainingPresses = false

// Gives every row its checkmark button. React owns these rows, so rather than trust one
// insertion to last, the sweep checks and re-adds. A row already carrying its button costs one
// shallow query to skip.
export function addReviewTogglesToTree() {
  const rows = document.querySelectorAll<HTMLElement>(FILE_TREE_ITEM_SELECTOR)
  if (!rows.length) {
    // Expected on every pass until the Files tab has rendered its sidebar.
    return
  }

  for (const row of rows) {
    const slot = row.querySelector<HTMLElement>(FILE_TREE_CONTENT_SLOT_SELECTOR)
    if (!slot) {
      console.debug(LOG_PREFIX, 'A file tree row has no content slot to hold its review button', row.id)
      continue
    }

    if (slot.querySelector(`:scope > .${REVIEW_TOGGLE_CLASS}`)) {
      continue
    }

    const button = document.createElement('button')
    button.type = 'button'
    button.className = REVIEW_TOGGLE_CLASS
    button.addEventListener('click', onReviewToggleClick)
    slot.appendChild(button)

    describeReviewToggle(row)
  }
}

function onReviewToggleClick(event: MouseEvent) {
  // The row underneath opens the file or expands the folder. This control does neither.
  event.preventDefault()
  event.stopPropagation()

  const button = event.currentTarget
  if (!(button instanceof HTMLElement)) {
    return
  }

  const row = button.closest<HTMLElement>(FILE_TREE_ITEM_SELECTOR)
  if (!row) {
    console.debug(LOG_PREFIX, 'A review button is not inside a tree row', button)
    return
  }

  const anchors = findFileAnchorsUnder(row)
  if (!anchors.length) {
    console.debug(LOG_PREFIX, 'No files found to review under', row.id)
    return
  }

  // Decide against where the row is heading, not the checkmark it currently shows. A press
  // queued a moment ago has not painted yet, so a user reversing their own last click would
  // otherwise be read as confirming it and the file would end up pressed twice into the same
  // state. Reading the toggles also sidesteps a directory mark the roll-up has not caught up
  // with.
  const willBeReviewed = anchors.every(isHeadedForReviewed)
  setReviewedUnder(row, anchors, !willBeReviewed)
}

// Where a file will stand once everything queued for it has landed.
function isHeadedForReviewed(anchor: string): boolean {
  const queued = pendingPresses.get(anchor)
  if (queued !== undefined) {
    return queued
  }

  const toggle = document.getElementById(anchor)?.querySelector(VIEWED_TOGGLE_SELECTOR)
  return toggle?.getAttribute(VIEWED_TOGGLE_STATE_ATTRIBUTE) === 'true'
}

// Marks a row and, for a directory, everything beneath it. We do not write the state
// ourselves: we press the real per-file toggles that already own it, and let the observer
// watching them paint the result back onto the tree.
function setReviewedUnder(row: HTMLElement, anchors: string[], shouldBeViewed: boolean) {
  for (const anchor of anchors) {
    pendingPresses.set(anchor, shouldBeViewed)
  }

  rowsAwaitingPresses.add(row)
  row.setAttribute(PENDING_PRESSES_MARKER, 'true')
  console.debug(LOG_PREFIX, `Queued ${anchors.length} viewed toggle(s) under ${row.id}`)

  // Clearing a row's mark straight away is honest: the moment the first file is un-reviewed
  // the row is no longer complete. Setting one early would not be, so a row being reviewed
  // waits for its queue to land and the roll-up to confirm it. A collapsed directory needs
  // this either way, having no mounted rows for the sweep to re-derive its state from.
  if (!shouldBeViewed) {
    applyViewedState(row, false)

    if (row.matches(FILE_TREE_DIRECTORY_SELECTOR)) {
      autoCollapsedDirectories.delete(row)
      expandDirectory(row)
    }
  }

  startDrainingPresses()
}

function startDrainingPresses() {
  if (isDrainingPresses) {
    return
  }

  isDrainingPresses = true
  drainNextPress()
}

function drainNextPress() {
  const [nextPress] = pendingPresses
  if (!nextPress) {
    isDrainingPresses = false

    for (const row of rowsAwaitingPresses) {
      row.removeAttribute(PENDING_PRESSES_MARKER)
    }
    rowsAwaitingPresses.clear()

    // The roll-up sits out the drain, so hand it the one run that counts.
    rollUpViewedDirectories()
    return
  }

  const [anchor, shouldBeViewed] = nextPress
  pendingPresses.delete(anchor)

  const toggle = document
    .getElementById(anchor)
    ?.querySelector<HTMLButtonElement>(VIEWED_TOGGLE_SELECTOR)
  if (!toggle) {
    console.debug(LOG_PREFIX, 'No viewed toggle rendered for', anchor)
  }
  // Re-read the state now rather than trusting what it was when this was queued: the user may
  // have pressed this file's own toggle in the meantime, and a click would undo their work.
  else if ((toggle.getAttribute(VIEWED_TOGGLE_STATE_ATTRIBUTE) === 'true') !== shouldBeViewed) {
    toggle.click()
  }

  window.setTimeout(drainNextPress, PRESS_INTERVAL_MS)
}

// A file row stands only for itself. A directory stands for every file whose path sits beneath
// it, which is resolved through the path map rather than the DOM: the whole point of clicking
// a finished folder's checkmark is to undo it, and by then its rows are collapsed away.
function findFileAnchorsUnder(row: HTMLElement): string[] {
  if (row.matches(FILE_TREE_ROW_SELECTOR)) {
    const anchor = anchorsByFilePath.get(row.id)
    if (!anchor) {
      return []
    }

    return [anchor]
  }

  const prefix = `${row.id}/`
  const anchors: string[] = []
  for (const [path, anchor] of anchorsByFilePath) {
    if (path.startsWith(prefix)) {
      anchors.push(anchor)
    }
  }

  return anchors
}

// Re-reads every toggle and repaints the whole sidebar. Used when GitHub streams more of the
// pull request in, which is the only time the set of rows can change.
export function markViewedFilesInTree() {
  const rows = document.querySelectorAll<HTMLElement>(FILE_TREE_ROW_SELECTOR)
  if (!rows.length) {
    return
  }

  // Turbo moves between pull requests without a reload, and file paths are not unique across
  // them.
  if (cachedTreePathname !== window.location.pathname) {
    anchorsByFilePath.clear()
    cachedTreePathname = window.location.pathname
  }

  const viewedByAnchor = new Map<string, boolean>()
  for (const toggle of document.querySelectorAll<HTMLElement>(VIEWED_TOGGLE_SELECTOR)) {
    const region = toggle.closest<HTMLElement>(DIFF_REGION_SELECTOR)
    if (!region) {
      console.debug(LOG_PREFIX, 'Found a viewed toggle outside any diff region', toggle)
      continue
    }

    viewedByAnchor.set(region.id, toggle.getAttribute(VIEWED_TOGGLE_STATE_ATTRIBUTE) === 'true')
  }

  for (const row of rows) {
    const anchor = getRowAnchor(row)
    if (!anchor) {
      continue
    }

    anchorsByFilePath.set(row.id, anchor)

    // A row whose file has not rendered yet has no toggle to read. Leaving it untouched keeps
    // whatever we last knew rather than flashing it back to unviewed.
    const isViewed = viewedByAnchor.get(anchor)
    if (isViewed !== undefined) {
      applyViewedState(row, isViewed)
    }
  }
}

// Repaints the single row behind a toggle the user just clicked. The full sweep runs on a lazy
// cadence to stay off the scroll path, which is too slow to acknowledge your own click, so this
// path answers immediately and leaves the sweep to catch everything else.
export function syncViewedRowForToggle(toggle: HTMLElement) {
  const region = toggle.closest<HTMLElement>(DIFF_REGION_SELECTOR)
  if (!region) {
    console.debug(LOG_PREFIX, 'A toggled viewed button sits outside any diff region', toggle)
    return
  }

  const row = document.querySelector<HTMLElement>(
    `${FILE_TREE_ROW_SELECTOR}:has(a[href="#${region.id}"])`
  )
  if (!row) {
    console.debug(LOG_PREFIX, 'No file tree row links to', region.id)
    return
  }

  applyViewedState(row, toggle.getAttribute(VIEWED_TOGGLE_STATE_ATTRIBUTE) === 'true')
}

// Rolls the file marks up the tree: a directory whose every descendant file is viewed gets the
// same checkmark, and folds itself away so what remains on screen is what is left to review.
export function rollUpViewedDirectories() {
  // While a queued batch is still landing, the tree is mid-transition: a folder would be
  // judged incomplete on every press and complete on the last, flickering the whole way
  // through. The drain runs one roll-up when it finishes, which is the only one that is true.
  if (isDrainingPresses) {
    return
  }

  const directories = document.querySelectorAll<HTMLElement>(FILE_TREE_DIRECTORY_SELECTOR)
  if (!directories.length) {
    return
  }

  const completedDirectories = new Set<HTMLElement>()

  for (const directory of directories) {
    // Descendants, not children: a folder is only finished when everything beneath it is,
    // however deep, and nested rows live inside this element.
    const files = directory.querySelectorAll<HTMLElement>(FILE_TREE_ROW_SELECTOR)

    // A collapsed directory has unmounted its files, so there is nothing left to count. Keep
    // whatever we last concluded instead of clearing a checkmark we cannot currently re-earn.
    if (!files.length) {
      if (directory.hasAttribute(VIEWED_TREE_ROW_MARKER)) {
        completedDirectories.add(directory)
      }
      continue
    }

    const isComplete = Array.from(files).every((file) => file.hasAttribute(VIEWED_TREE_ROW_MARKER))
    applyViewedState(directory, isComplete)

    if (isComplete) {
      completedDirectories.add(directory)
    }
    else {
      autoCollapsedDirectories.delete(directory)
    }
  }

  for (const directory of completedDirectories) {
    // Collapse only the outermost finished directory of a branch, since everything below it
    // folds away with it. This is what walks the collapse upwards as a review fills in: once
    // the last sibling is viewed, the parent takes over from the children it contains.
    const parent = directory.parentElement?.closest<HTMLElement>(FILE_TREE_DIRECTORY_SELECTOR)
    if (parent && completedDirectories.has(parent)) {
      continue
    }

    collapseDirectory(directory)
  }
}

function collapseDirectory(directory: HTMLElement) {
  if (autoCollapsedDirectories.has(directory) || directory.getAttribute('aria-expanded') !== 'true') {
    return
  }

  autoCollapsedDirectories.add(directory)
  if (clickDirectoryChevron(directory)) {
    console.debug(LOG_PREFIX, 'Collapsed a fully reviewed directory:', directory.id)
  }
}

function expandDirectory(directory: HTMLElement) {
  if (directory.getAttribute('aria-expanded') !== 'false') {
    return
  }

  // Re-opening a folder the user just un-reviewed puts back what they are asking to look at
  // again; leaving it shut would hide the very files they now have to read.
  if (clickDirectoryChevron(directory)) {
    console.debug(LOG_PREFIX, 'Reopened an un-reviewed directory:', directory.id)
  }
}

// Primer holds the expanded state in React, so writing `aria-expanded` ourselves would only
// desynchronise the attribute from the component that owns it. Click the chevron instead,
// exactly as a user would.
function clickDirectoryChevron(directory: HTMLElement): boolean {
  const chevron = directory.querySelector<HTMLElement>(FILE_TREE_TOGGLE_SELECTOR)
  if (!chevron) {
    console.debug(LOG_PREFIX, 'A directory row has no chevron to click', directory.id)
    return false
  }

  chevron.click()
  return true
}

function applyViewedState(row: HTMLElement, isViewed: boolean) {
  if (row.hasAttribute(VIEWED_TREE_ROW_MARKER) === isViewed) {
    return
  }

  if (isViewed) {
    row.setAttribute(VIEWED_TREE_ROW_MARKER, 'true')
  }
  else {
    row.removeAttribute(VIEWED_TREE_ROW_MARKER)
  }

  describeReviewToggle(row)
}

// The button says what pressing it will do, not what the row currently is.
function describeReviewToggle(row: HTMLElement) {
  const button = row.querySelector<HTMLElement>(
    `${FILE_TREE_CONTENT_SLOT_SELECTOR} > .${REVIEW_TOGGLE_CLASS}`
  )
  if (!button) {
    return
  }

  const label = row.hasAttribute(VIEWED_TREE_ROW_MARKER)
    ? UNREVIEW_LABEL
    : REVIEW_LABEL

  button.title = label
  button.setAttribute('aria-label', label)
}

function getRowAnchor(row: HTMLElement): string | null {
  const cached = anchorsByRow.get(row)
  if (cached) {
    return cached
  }

  const link = row.querySelector<HTMLAnchorElement>('a[href^="#diff-"]')
  const anchor = link?.getAttribute('href')?.slice(1)
  if (!anchor) {
    console.debug(LOG_PREFIX, 'A file tree row has no link to a diff region', row)
    return null
  }

  anchorsByRow.set(row, anchor)
  return anchor
}
