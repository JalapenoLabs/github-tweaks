// Copyright © 2026 Jalapeno Labs
//
// Mirrors each file's "Viewed" toggle onto its row in the file tree sidebar, so you can see
// how far through a review you are without scrolling the diff column to find out.
//
// The two halves of the page share a join key. Every file renders a `diff-<sha of its path>`
// region carrying the real toggle, and the matching tree row wraps a link to that same
// fragment. Reading the toggle rather than tracking clicks means we also pick up the state
// GitHub restores from the server on load, and anything marked viewed in another tab.
//
// We record the result as an attribute and let CSS draw the checkmark. Injecting our own
// nodes into a React-owned tree risks the reconciliation crashes that come from touching
// children React believes it owns, and a class would not survive either: React rewrites
// `className` on every re-render, while leaving attributes it never set alone.

import { LOG_PREFIX, VIEWED_TREE_ROW_MARKER } from '../constants'
import {
  DIFF_REGION_SELECTOR,
  FILE_TREE_ROW_SELECTOR,
  VIEWED_TOGGLE_SELECTOR,
  VIEWED_TOGGLE_STATE_ATTRIBUTE
} from './githubSelectors'

// A tree row's link never changes, so resolving it once per row keeps the repeated sweeps
// down to one attribute read each.
const anchorsByRow = new WeakMap<HTMLElement, string>()

// Re-reads every toggle and repaints the whole sidebar. Used when GitHub streams more of the
// pull request in, which is the only time the set of rows can change.
export function markViewedFilesInTree() {
  const rows = document.querySelectorAll<HTMLElement>(FILE_TREE_ROW_SELECTOR)
  if (!rows.length) {
    // Expected on every pass until the Files tab has rendered its sidebar.
    return
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
    const isViewed = anchor
      ? viewedByAnchor.get(anchor)
      : undefined

    // A row whose file has not been rendered yet has no toggle to read. Leaving it untouched
    // keeps whatever we last knew rather than flashing it back to unviewed.
    if (isViewed !== undefined) {
      applyViewedState(row, isViewed)
    }
  }
}

// Repaints the single row behind a toggle the user just clicked. The full sweep runs on a
// lazy cadence to stay off the scroll path, which is too slow to acknowledge your own click,
// so this path answers immediately and leaves the sweep to catch everything else.
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

function applyViewedState(row: HTMLElement, isViewed: boolean) {
  if (row.hasAttribute(VIEWED_TREE_ROW_MARKER) === isViewed) {
    return
  }

  if (isViewed) {
    row.setAttribute(VIEWED_TREE_ROW_MARKER, 'true')
    return
  }

  row.removeAttribute(VIEWED_TREE_ROW_MARKER)
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
