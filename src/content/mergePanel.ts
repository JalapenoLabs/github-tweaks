// Copyright © 2026 Jalapeno Labs
//
// Relocates the squash/merge panel from the bottom of the pull request conversation up to
// the very top of the discussion column, above the description, so it is reachable without
// scrolling past every comment. We MOVE the live node rather than cloning it, which
// preserves all of GitHub's own behaviour (the merge button, the merge-method dropdown, and
// the socket updates that refresh mergeability in place).
//
// The merge box and the discussion timeline are siblings inside the discussion column and
// already share GitHub's indentation classes, so dropping the merge box immediately before
// the timeline keeps everything aligned.

import { LOG_PREFIX, RELOCATED_MARKER, HIDDEN_DIVIDER_MARKER } from '../constants'
import { MERGE_PANEL_SELECTORS } from './githubSelectors'

const DISCUSSION_SELECTOR = '.js-discussion'
const TIMELINE_PARTIAL_SELECTOR = '[data-partial-name="pullRequestsConversationsRoute.Timeline"]'
const TIMELINE_DIVIDER_SELECTOR = '.discussion-timeline-actions'

// Returns true when a merge box is present (and now lives at the top), so the caller can
// run the dependent cleanup. Returns false when there is nothing to relocate.
export function relocateMergePanel(): boolean {
  let mergePanel: HTMLElement | null = null
  for (const selector of MERGE_PANEL_SELECTORS) {
    mergePanel = document.querySelector<HTMLElement>(selector)
    if (mergePanel) {
      break
    }
  }

  if (!mergePanel) {
    // Expected and common: the merge box only exists for open PRs the viewer can act on.
    // A closed, merged, or read-only PR simply has nothing to relocate.
    return false
  }

  const discussion = document.querySelector<HTMLElement>(DISCUSSION_SELECTOR)
  if (!discussion?.parentElement) {
    console.debug(LOG_PREFIX, 'Could not find the discussion timeline to anchor the merge panel above')
    return false
  }

  // Already sitting directly above the timeline -> our previous run did the work.
  const isAlreadyRelocated = mergePanel.getAttribute(RELOCATED_MARKER) === 'true'
  if (isAlreadyRelocated && mergePanel.nextElementSibling === discussion) {
    return true
  }

  mergePanel.setAttribute(RELOCATED_MARKER, 'true')
  mergePanel.classList.add('pr-enhancer-merge-panel')
  discussion.parentElement.insertBefore(mergePanel, discussion)

  console.debug(LOG_PREFIX, 'Relocated merge panel above the conversation timeline')
  return true
}

// Once the merge box moves to the top, the spacer that used to sit just above it is left
// floating empty at the bottom of the timeline. Hide that trailing divider so the bottom of
// the conversation looks intentional again. We hide (rather than remove) the node to stay
// resilient against GitHub's socket-driven partial re-renders.
export function hideTrailingTimelineDivider() {
  const timeline = document.querySelector<HTMLElement>(TIMELINE_PARTIAL_SELECTOR)
  if (!timeline) {
    return
  }

  const dividers = timeline.querySelectorAll<HTMLElement>(TIMELINE_DIVIDER_SELECTOR)
  const lastDivider = dividers[dividers.length - 1]
  if (!lastDivider || lastDivider.getAttribute(HIDDEN_DIVIDER_MARKER) === 'true') {
    return
  }

  lastDivider.setAttribute(HIDDEN_DIVIDER_MARKER, 'true')
  lastDivider.style.display = 'none'

  console.debug(LOG_PREFIX, 'Hid the trailing empty discussion-timeline-actions divider')
}
