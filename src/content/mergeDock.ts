// Copyright © 2026 Jalapeno Labs
//
// A small dock that follows you down a pull request conversation, offering the merge action
// and a way back to the top without scrolling to reach either.
//
// The merge button here is a proxy, not a reimplementation. It mirrors the real button's
// label and its disabled state, and clicking it clicks the real one, so GitHub keeps sole
// ownership of what merging actually means: which method is the default, whether the branch
// is mergeable, and the commit message step it expands afterwards. There is no second code
// path that could disagree with the page about whether merging is allowed.
//
// The dock is built in `document.body`, outside React's tree, so nothing here can trip the
// reconciliation crashes that come from mutating children React believes it owns.

import { LOG_PREFIX } from '../constants'
import {
  ARIA_DISABLED_ATTRIBUTE,
  BUTTON_LABEL_SELECTOR,
  MERGE_BUTTON_GROUP_SELECTOR,
  MERGE_PANEL_SELECTORS
} from './githubSelectors'

const BACK_TO_TOP_LABEL = 'Back to top'

type Dock = {
  container: HTMLElement
  merge: HTMLButtonElement
  sentinel: HTMLElement
  scrollObserver: IntersectionObserver
}

let dock: Dock | null = null

// The dock earns its place only when both are true: we are on a conversation tab, and the top
// of the page has scrolled away. Tracking them apart keeps the scroll observer from needing
// to know anything about routing.
let isOnConversationPage = false
let isPageScrolledToTop = true

export function ensureMergeDock() {
  isOnConversationPage = true

  // Turbo can swap the page out from under us. If either of our own nodes went with it,
  // rebuild: a surviving observer would otherwise watch a detached sentinel forever and the
  // dock would freeze in whatever state it was last left.
  if (dock && (!dock.container.isConnected || !dock.sentinel.isConnected)) {
    dock.scrollObserver.disconnect()
    dock.container.remove()
    dock.sentinel.remove()
    dock = null
  }

  if (!dock) {
    dock = buildDock()
  }

  syncMergeButton(dock)
  refreshDockVisibility()
}

// The dock outlives a Turbo navigation away from the conversation, because it hangs off
// `document.body` rather than the page content that gets swapped.
export function hideMergeDock() {
  isOnConversationPage = false
  refreshDockVisibility()
}

function refreshDockVisibility() {
  if (!dock) {
    return
  }

  dock.container.hidden = !isOnConversationPage || isPageScrolledToTop
}

function buildDock(): Dock {
  const container = document.createElement('div')
  container.className = 'pr-enhancer-dock'
  container.hidden = true

  const backToTop = document.createElement('button')
  backToTop.type = 'button'
  backToTop.className = 'pr-enhancer-dock-button pr-enhancer-dock-back-to-top'
  backToTop.textContent = BACK_TO_TOP_LABEL
  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })

  const merge = document.createElement('button')
  merge.type = 'button'
  merge.className = 'pr-enhancer-dock-button pr-enhancer-dock-merge'
  merge.addEventListener('click', forwardClickToMergeButton)

  container.append(backToTop, merge)
  document.body.appendChild(container)

  // A one pixel marker pinned to the top of the document answers "is the page scrolled?"
  // without putting a listener anywhere near the scroll path.
  const sentinel = document.createElement('div')
  sentinel.className = 'pr-enhancer-scroll-sentinel'
  document.body.prepend(sentinel)

  const scrollObserver = new IntersectionObserver((entries) => {
    isPageScrolledToTop = entries[entries.length - 1].isIntersecting
    refreshDockVisibility()
  })
  scrollObserver.observe(sentinel)

  return { container, merge, sentinel, scrollObserver }
}

function forwardClickToMergeButton() {
  const panel = findMergePanel()
  const mergeButton = findMergeButton()
  if (!panel || !mergeButton) {
    console.debug(LOG_PREFIX, 'The merge button went away before the dock could forward a click')
    return
  }

  mergeButton.click()

  // GitHub answers that click by expanding a commit message form and asking for a second
  // confirmation, so forwarding it blind would leave that form waiting off-screen. Wait a
  // frame for React to render the form, or we scroll to where the panel used to end.
  window.requestAnimationFrame(() => {
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

// Mirrors the real button rather than deciding anything: whatever it says and whatever state
// it is in, the dock repeats. A pull request with no merge box at all (closed, merged, or one
// the viewer cannot act on) drops the button and keeps "Back to top".
function syncMergeButton(currentDock: Dock) {
  const mergeButton = findMergeButton()
  if (!mergeButton) {
    currentDock.merge.hidden = true
    return
  }

  currentDock.merge.hidden = false

  const label = mergeButton.querySelector(BUTTON_LABEL_SELECTOR)?.textContent?.replace(/\s+/g, ' ').trim()
  if (!label) {
    console.debug(LOG_PREFIX, 'The merge button has no readable label', mergeButton)
  }
  else if (currentDock.merge.textContent !== label) {
    currentDock.merge.textContent = label
  }

  const isDisabled = mergeButton.getAttribute(ARIA_DISABLED_ATTRIBUTE) === 'true' || mergeButton.disabled
  if (currentDock.merge.disabled !== isDisabled) {
    currentDock.merge.disabled = isDisabled
  }

  // When GitHub blocks merging it explains why through the button group's description. Carry
  // that across, so a greyed-out dock button is never a mystery.
  const reason = isDisabled
    ? readBlockedReason(mergeButton)
    : ''
  if (currentDock.merge.title !== reason) {
    currentDock.merge.title = reason
  }
}

function readBlockedReason(mergeButton: HTMLButtonElement): string {
  const describedBy = mergeButton.closest(MERGE_BUTTON_GROUP_SELECTOR)?.getAttribute('aria-describedby')
  if (!describedBy) {
    return ''
  }

  return document.getElementById(describedBy)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

function findMergePanel(): HTMLElement | null {
  for (const selector of MERGE_PANEL_SELECTORS) {
    const panel = document.querySelector<HTMLElement>(selector)
    if (panel) {
      return panel
    }
  }

  // Expected and common: only an open pull request the viewer can act on has a merge box.
  return null
}

function findMergeButton(): HTMLButtonElement | null {
  // Scope hard. "Close pull request" is a button on this page too, and the only thing keeping
  // us off it is that it lives outside the merge box's button group.
  const group = findMergePanel()?.querySelector(MERGE_BUTTON_GROUP_SELECTOR)
  if (!group) {
    return null
  }

  // The first button is the merge action; the slot beside it holds the dropdown for choosing
  // a different merge method.
  return group.querySelector<HTMLButtonElement>('button')
}
