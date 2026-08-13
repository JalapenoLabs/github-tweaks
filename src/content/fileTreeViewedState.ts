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

  setReviewedUnder(row, !row.hasAttribute(VIEWED_TREE_ROW_MARKER))
}

// Marks a row and, for a directory, everything beneath it. We do not write the state
// ourselves: we press the real per-file toggles that already own it, and let the observer
// watching them paint the result back onto the tree.
function setReviewedUnder(row: HTMLElement, shouldBeViewed: boolean) {
  const anchors = findFileAnchorsUnder(row)
  if (!anchors.length) {
    console.debug(LOG_PREFIX, 'No files found to review under', row.id)
    return
  }

  let pressed = 0
  for (const anchor of anchors) {
    const toggle = document
      .getElementById(anchor)
      ?.querySelector<HTMLButtonElement>(VIEWED_TOGGLE_SELECTOR)
    if (!toggle) {
      console.debug(LOG_PREFIX, 'No viewed toggle rendered for', anchor)
      continue
    }

    // Each click is a request to GitHub, so only press the toggles actually out of step.
    if ((toggle.getAttribute(VIEWED_TOGGLE_STATE_ATTRIBUTE) === 'true') === shouldBeViewed) {
      continue
    }

    toggle.click()
    pressed++
  }

  console.debug(LOG_PREFIX, `Pressed ${pressed} of ${anchors.length} viewed toggle(s) under ${row.id}`)

  // A collapsed directory has no mounted rows for the sweep to re-derive its state from, so
  // record the row's own result here rather than wait for a recount that cannot happen.
  applyViewedState(row, shouldBeViewed)

  if (!shouldBeViewed && row.matches(FILE_TREE_DIRECTORY_SELECTOR)) {
    autoCollapsedDirectories.delete(row)
    expandDirectory(row)
  }
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
