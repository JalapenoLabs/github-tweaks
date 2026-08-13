// Copyright © 2026 Jalapeno Labs
//
// Corrects the placeholder height GitHub reserves for off-screen files on a large pull
// request, which is what actually makes a 400-file diff painful to scroll.
//
// GitHub already virtualizes its diff column, and does it the right way: every file wrapper
// carries `content-visibility: auto`, letting the browser skip style, layout and paint for
// files that are off-screen, plus a `contain-intrinsic-size` telling it how much room to
// hold open in their place. That machinery is sound. The numbers fed into it are not.
//
// On a 400-file review, a `yarn.lock` entry reserves 175px for roughly 49,000px of real
// content. Whenever it drifts near the viewport the browser materializes it and the document
// grows by 49,000px in one frame; scrolling away collapses it again. The scrollbar leaps,
// scroll anchoring fights the change, and every swing costs a full re-layout of the list.
// That is the stutter, and it is also why marking a file viewed mid-page can throw the
// scroll position somewhere else entirely.
//
// The correction is cheap. A skipped file's rows are still in the DOM, so we can count them
// without rendering anything, multiply by a row height measured from a file that is on
// screen, and write an honest reservation. We keep the `auto` keyword, so the browser still
// replaces our estimate with the true height the first time it renders the file: the
// estimate only has to be good enough to survive the first encounter.

import { LOG_PREFIX } from '../constants'
import { DIFF_ENTRY_SELECTOR, DIFF_LINE_ROW_SELECTOR, DIFF_REGION_SELECTOR } from './githubSelectors'

// A collapsed file header. Taken from the entries GitHub itself reserves space for when
// there is nothing but a header to show, all of which come out at exactly 42px.
const HEADER_HEIGHT_PX = 42

// Stands in until we can measure a row the browser has really laid out. The observed median
// across a 400-file diff is 24.2px, so guessing here is wrong by a few percent rather than
// by the orders of magnitude we are here to fix.
const FALLBACK_ROW_HEIGHT_PX = 24

// How far a reservation must fall short before we overwrite it. A file that renders a few
// hundred pixels taller than promised is not worth a mutation, and leaving GitHub's own
// numbers alone wherever they are close keeps us out of its way.
const MIN_SHORTFALL_PX = 1000

// The reservation we last evaluated for each entry. GitHub rewrites the inline style when it
// re-renders a file, so comparing against this answers "has anything changed since we last
// looked?" from a single style read, instead of re-counting the entry's rows every pass.
const evaluatedReservations = new WeakMap<HTMLElement, number>()

let measuredRowHeight = 0

export function reserveAccurateDiffHeights() {
  const entries = document.querySelectorAll<HTMLElement>(DIFF_ENTRY_SELECTOR)
  if (!entries.length) {
    // Expected on every pass until GitHub has streamed the diff column in.
    return
  }

  const rowHeight = measureDiffRowHeight(entries)

  // Take every measurement before writing any of them. Writing an inline style invalidates
  // layout, so interleaving the two would force a reflow per file across hundreds of files:
  // precisely the stall this module exists to remove.
  const corrections: { entry: HTMLElement, correctedHeight: number }[] = []

  for (const entry of entries) {
    const reservedHeight = readReservedHeight(entry)
    if (evaluatedReservations.get(entry) === reservedHeight) {
      continue
    }

    const rowCount = entry.querySelectorAll(DIFF_LINE_ROW_SELECTOR).length
    const renderedHeight = HEADER_HEIGHT_PX + rowCount * rowHeight

    // Three reasons to leave an entry alone: it reserves nothing, so GitHub is not
    // virtualizing it and it needs no placeholder; it has no rows to count, so it is
    // collapsed or unfetched and GitHub's own estimate is better informed than ours; or its
    // reservation is already close enough that correcting it would buy nothing.
    if (!reservedHeight || !rowCount || renderedHeight - reservedHeight < MIN_SHORTFALL_PX) {
      evaluatedReservations.set(entry, reservedHeight)
      continue
    }

    corrections.push({ entry, correctedHeight: renderedHeight })
  }

  for (const { entry, correctedHeight } of corrections) {
    const reservation = `auto ${Math.round(correctedHeight)}px`

    // The wrapper and the region nested inside it each carry their own placeholder, so
    // correcting one and not the other still lets the file collapse back down.
    entry.style.setProperty('contain-intrinsic-size', reservation)
    evaluatedReservations.set(entry, Math.round(correctedHeight))

    const region = entry.querySelector<HTMLElement>(DIFF_REGION_SELECTOR)
    if (!region) {
      console.debug(LOG_PREFIX, 'A diff entry has no inner region to resize', entry)
      continue
    }

    region.style.setProperty('contain-intrinsic-size', reservation)
    console.debug(LOG_PREFIX, `Reserved ${reservation} for ${region.id}`)
  }
}

// GitHub writes `contain-intrinsic-size: auto <n>px` inline. A single length there applies to
// both axes, so the trailing number is the reserved height under either spelling.
function readReservedHeight(entry: HTMLElement): number {
  const lengths = entry.style.getPropertyValue('contain-intrinsic-size').match(/[\d.]+(?=px)/g)
  if (!lengths) {
    return 0
  }

  return Number.parseFloat(lengths[lengths.length - 1])
}

// Calibrate against a row the browser has actually laid out. Rows inside a skipped file
// report a zero-height rect, which doubles as the test for whether a file is rendered at
// all, so the first non-zero row we find is by definition a real measurement.
function measureDiffRowHeight(entries: NodeListOf<HTMLElement>): number {
  if (measuredRowHeight) {
    return measuredRowHeight
  }

  for (const entry of entries) {
    const row = entry.querySelector<HTMLElement>(DIFF_LINE_ROW_SELECTOR)
    const height = row?.getBoundingClientRect().height ?? 0
    if (height) {
      measuredRowHeight = height
      console.debug(LOG_PREFIX, `Calibrated the diff row height to ${height}px`)
      return measuredRowHeight
    }
  }

  // Nothing is on screen yet. Use the fallback without caching it, so the next pass gets
  // another chance at a real measurement.
  console.debug(LOG_PREFIX, 'No rendered diff row to calibrate against yet; using the fallback height')
  return FALLBACK_ROW_HEIGHT_PX
}
