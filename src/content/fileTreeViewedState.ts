// Copyright © 2026 Jalapeno Labs
//
// Turns the file tree sidebar into the place you track a review from: every row shows whether
// it is done, and lets you say so.
//
// Each half of the page holds one of the two things we need, and neither holds both.
//
// The sidebar knows the paths. A tree row's `id` is the file's full path, and the row links to
// its `diff-<sha>` region, so the sidebar is where the path-to-anchor index comes from. The
// diff header cannot supply it: that text is display, so a rename reads "old → new" and a long
// path is ellipsised down to "…/common/getUniqueDestinationPath.ts".
//
// The diff column knows the state. It carries the real "Viewed" toggle for every file in the
// comparison and stays in the DOM whether or not a file is on screen, so a file's state is
// always readable through its anchor.
//
// What makes this more than a lookup is that the sidebar is a moving target. It renders
// progressively on a large pull request, and it unmounts a folder's rows when that folder
// collapses. So the index is accumulated and never discarded, and the roll-up refuses to judge
// anything until the index accounts for every file in the comparison. Calling a folder
// finished on the strength of four rows when the comparison holds nine is how you fold away a
// folder that still has files waiting in it.
//
// Writing state works the way the merge dock does: the checkmark on each row is a real button
// that presses GitHub's own per-file toggles. GitHub keeps sole ownership of what "viewed"
// means; we only press its buttons and paint back what it decides.

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

type DiffFile = {
  path: string
  anchor: string
  isViewed: boolean
}

// Every file path the sidebar has ever shown, mapped to its diff anchor. Accumulated rather
// than rebuilt, because the sidebar unmounts a collapsed folder's rows and we still have to
// reach the files underneath it: undoing a finished folder is the whole point of its green
// checkmark, and by then its rows are gone.
const anchorsByFilePath = new Map<string, string>()
const pathsByAnchor = new Map<string, string>()
let indexedPathname = ''

// How many consecutive passes the index has to stop growing before folders are judged. The
// sidebar streams its rows in, and a folder judged against a half-rendered one folds away with
// files still waiting inside it. Nothing in the page announces that the sidebar has finished,
// and no complete list of paths exists to check against: the diff headers ellipsise long names
// and spell renames "old → new", and the table labels that do carry a full path are only
// present for files whose diff body has rendered. So settle on it instead of asking.
const SETTLED_PASSES_BEFORE_ROLLUP = 2

let lastIndexSize = -1
let settledPasses = 0

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

// Repaints the sidebar: which files are viewed, which folders are finished, and which of those
// should fold away.
export function syncReviewStateToTree() {
  indexTreeRows()

  const viewedByAnchor = readViewedState()

  for (const row of document.querySelectorAll<HTMLElement>(FILE_TREE_ROW_SELECTOR)) {
    const anchor = anchorsByFilePath.get(row.id)
    if (!anchor) {
      continue
    }

    applyViewedState(row, viewedByAnchor.get(anchor) === true)
  }

  rollUpViewedDirectories(viewedByAnchor)
}

// Records the path and anchor of every file row the sidebar is currently showing. Rows arrive
// over several passes on a large pull request, and vanish again when a folder collapses, so
// this only ever adds.
function indexTreeRows() {
  // Turbo moves between pull requests without a reload, and paths are not unique across them.
  if (indexedPathname !== window.location.pathname) {
    anchorsByFilePath.clear()
    pathsByAnchor.clear()
    indexedPathname = window.location.pathname
    lastIndexSize = -1
    settledPasses = 0
  }

  for (const row of document.querySelectorAll<HTMLElement>(FILE_TREE_ROW_SELECTOR)) {
    if (anchorsByFilePath.has(row.id)) {
      continue
    }

    const anchor = row.querySelector<HTMLAnchorElement>('a[href^="#diff-"]')?.getAttribute('href')?.slice(1)
    if (!anchor) {
      console.debug(LOG_PREFIX, 'A file tree row has no link to a diff region', row.id)
      continue
    }

    anchorsByFilePath.set(row.id, anchor)
    pathsByAnchor.set(anchor, row.id)
  }

  if (anchorsByFilePath.size === lastIndexSize) {
    settledPasses++
    return
  }

  lastIndexSize = anchorsByFilePath.size
  settledPasses = 0
}

// Repaints the one row behind a toggle that just changed. Every lookup here is by key, so this
// stays cheap enough to run on each press of a draining batch; the full sweep above walks the
// document three times and is far too heavy to run ten times a second.
export function syncViewedRowForToggle(toggle: HTMLElement) {
  const region = toggle.closest<HTMLElement>(DIFF_REGION_SELECTOR)
  if (!region) {
    console.debug(LOG_PREFIX, 'A toggled viewed button sits outside any diff region', toggle)
    return
  }

  const path = pathsByAnchor.get(region.id)
  if (!path) {
    // The sidebar has not shown this file yet, so there is no row to paint. The next full
    // sweep indexes it.
    return
  }

  // A tree row is keyed by its path, so this is the row without searching for it.
  const row = document.getElementById(path)
  if (!row) {
    // Its folder is collapsed, so the row is unmounted. Nothing to paint, and nothing wrong.
    return
  }

  applyViewedState(row, toggle.getAttribute(VIEWED_TOGGLE_STATE_ATTRIBUTE) === 'true')
}

// Reads the state of every file in the comparison in a single pass. Answering one file at a
// time instead would be a DOM query per file per directory, which on a four hundred file
// review is tens of thousands of lookups for one repaint.
function readViewedState(): Map<string, boolean> {
  const viewedByAnchor = new Map<string, boolean>()

  for (const toggle of document.querySelectorAll<HTMLElement>(VIEWED_TOGGLE_SELECTOR)) {
    const region = toggle.closest<HTMLElement>(DIFF_REGION_SELECTOR)
    if (!region) {
      console.debug(LOG_PREFIX, 'Found a viewed toggle outside any diff region', toggle)
      continue
    }

    viewedByAnchor.set(region.id, toggle.getAttribute(VIEWED_TOGGLE_STATE_ATTRIBUTE) === 'true')
  }

  return viewedByAnchor
}

// A file row stands for itself; a directory row stands for every file whose path sits beneath
// it. Both read from the accumulated index, so a folder whose rows have been collapsed away
// still resolves to everything it contains.
function findFilesUnder(row: HTMLElement, viewedByAnchor: Map<string, boolean>): DiffFile[] {
  const own = anchorsByFilePath.get(row.id)
  if (own) {
    return [{ path: row.id, anchor: own, isViewed: viewedByAnchor.get(own) === true }]
  }

  const prefix = `${row.id}/`
  const contents: DiffFile[] = []
  for (const [path, anchor] of anchorsByFilePath) {
    if (path.startsWith(prefix)) {
      contents.push({ path, anchor, isViewed: viewedByAnchor.get(anchor) === true })
    }
  }

  return contents
}

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

  const contents = findFilesUnder(row, readViewedState())
  if (!contents.length) {
    console.debug(LOG_PREFIX, 'No files found to review under', row.id)
    return
  }

  // Decide against where the row is heading, not the checkmark it currently shows. A press
  // queued a moment ago has not painted yet, so a user reversing their own last click would
  // otherwise be read as confirming it, and the file would be pressed twice into one state.
  const willBeReviewed = contents.every(isHeadedForReviewed)
  setReviewedUnder(row, contents, !willBeReviewed)
}

// Where a file will stand once everything queued for it has landed.
function isHeadedForReviewed(file: DiffFile): boolean {
  const queued = pendingPresses.get(file.anchor)
  if (queued !== undefined) {
    return queued
  }

  return file.isViewed
}

function setReviewedUnder(row: HTMLElement, contents: DiffFile[], shouldBeViewed: boolean) {
  for (const file of contents) {
    pendingPresses.set(file.anchor, shouldBeViewed)
  }

  rowsAwaitingPresses.add(row)
  row.setAttribute(PENDING_PRESSES_MARKER, 'true')
  console.debug(LOG_PREFIX, `Queued ${contents.length} viewed toggle(s) under ${row.id}`)

  // Clearing a row's mark straight away is honest: the moment the first file is un-reviewed
  // the row is no longer complete. Setting one early would not be, so a row being reviewed
  // waits for its queue to land and the roll-up to confirm it.
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
    syncReviewStateToTree()
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

// Rolls the file marks up the tree: a directory whose every file is viewed gets the same
// checkmark, and folds itself away so what remains on screen is what is left to review.
function rollUpViewedDirectories(viewedByAnchor: Map<string, boolean>) {
  // While a queued batch is still landing, the tree is mid-transition: a folder would be
  // judged incomplete on every press and complete on the last, flickering the whole way
  // through. The drain runs one roll-up when it finishes, which is the only one that is true.
  if (isDrainingPresses) {
    return
  }

  if (settledPasses < SETTLED_PASSES_BEFORE_ROLLUP) {
    console.debug(LOG_PREFIX, `Sidebar still settling at ${anchorsByFilePath.size} files; holding the roll-up`)
    return
  }

  const completedDirectories = new Set<HTMLElement>()

  for (const directory of document.querySelectorAll<HTMLElement>(FILE_TREE_DIRECTORY_SELECTOR)) {
    const contents = findFilesUnder(directory, viewedByAnchor)
    if (!contents.length) {
      console.debug(LOG_PREFIX, 'A directory row holds no files from the comparison', directory.id)
      continue
    }

    const isComplete = contents.every((file) => file.isViewed)
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
