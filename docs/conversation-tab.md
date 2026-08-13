# Conversation tab

## The merge panel sits at the top

GitHub puts the merge box below the entire discussion timeline, so merging a busy pull
request means scrolling past every comment to reach it. `src/content/mergePanel.ts` moves it
to just above the timeline.

It **moves the live node** rather than cloning it. That keeps all of GitHub's own behaviour
intact: the merge button, the merge-method dropdown, and the socket updates that refresh
mergeability in place. A clone would drift out of date the moment CI reported back.

Once the box moves, the spacer that used to sit above it is left floating empty at the bottom
of the timeline, so that trailing divider is hidden. We hide rather than remove it, to stay
resilient against GitHub's socket-driven partial re-renders.

## A floating dock once you scroll

`src/content/mergeDock.ts` pins two buttons to the bottom left as soon as the top of the page
scrolls away: **Back to top**, and the pull request's merge action.

### The merge button is a proxy

It mirrors the real button and forwards clicks to it. It never decides anything itself.

- **The label is copied**, so it reads whatever the repository's default method is: "Squash
  and merge", "Merge pull request", "Rebase and merge".
- **The disabled state is copied.** Primer disables buttons with `aria-disabled` rather than
  the `disabled` property, so the control stays focusable and can explain itself. Reading
  `.disabled` reports false on a button that plainly is not clickable.
- **The reason is copied too.** When merging is blocked, GitHub explains why through the
  button group's `aria-describedby`. The dock carries that across as a tooltip, so a greyed
  out button is never a mystery.
- **No merge box means no button.** Closed, merged, or read-only pull requests keep only
  "Back to top".

Clicking does not merge anything on its own. GitHub responds by expanding the commit message
form and asking for a second confirmation, so the dock scrolls the merge box into view on the
next frame; forwarding the click blind would leave that form waiting off-screen.

### Scoping the selector matters

"Close pull request" is also a button on this page. The only thing keeping the proxy off it
is that the merge action is the first button inside the one Primer `ButtonGroup` **inside the
merge box**, and "Close pull request" sits outside it. Do not loosen that scope.

### Why an IntersectionObserver and not a scroll listener

A one pixel sentinel pinned to the top of the document reports whether the page is scrolled.
That keeps the question off the scroll path entirely, which matters on exactly the pull
requests where the dock is most useful.

The dock and the sentinel both hang off `document.body`, outside React's tree, so nothing
here can trip the reconciliation crashes that come from mutating children React believes it
owns. They also survive Turbo navigation, which swaps the page content but not the body, so
`ensureMergeDock` rebuilds if either node is ever found detached.
