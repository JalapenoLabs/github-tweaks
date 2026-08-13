# File tree sidebar

The sidebar is where a review is tracked: every row shows whether it is done, and lets you say
so. `src/content/fileTreeViewedState.ts` owns all of it.

## The checkmark

Every row carries a checkmark button at its right edge.

| Row state | Appearance | Pressing it |
| --- | --- | --- |
| Not reviewed | hidden until you hover the row, then yellow | "Mark reviewed" |
| Reviewed | always visible, green, name faded | "Mark unreviewed" |

The button grows slightly under the pointer and dips when pressed, and both animations are
dropped under `prefers-reduced-motion`. The tooltip names the action, not the state.

Hidden also means unclickable (`pointer-events: none`), so a row you are not hovering has no
invisible target sitting on it. Every rule that reveals the button re-enables it in the same
declaration.

Hover is detected on the row's own **container**, never the row element. A directory row
contains its descendants, so `li:hover` would light a folder's button up from anywhere inside
the folder.

## Reading the state

We read GitHub's per-file toggle rather than tracking clicks, so we also pick up the state the
server restores on load and anything marked viewed in another tab. The `diff-<sha>` fragment
joins the two halves of the page: the toggle lives inside the file's diff region, and the tree
row links to that same fragment.

## Writing the state

Pressing a row's checkmark clicks the real toggles in the diff column. Nothing here decides
what "viewed" means; it only presses GitHub's buttons and lets the observer watching them
paint the result back.

A directory's button stands for every file beneath it, resolved through a **path map** rather
than the DOM. This matters: a finished folder auto-collapses, Primer unmounts its rows, and
the whole point of clicking its green check is to undo it. Walking the DOM at that moment
finds nothing. So every file path the tree has shown is kept mapped to its diff anchor, and a
directory takes every path under `<its id>/`. Un-reviewing a directory also reopens it, since
leaving it shut would hide the files the user just asked to read again.

### Presses are paced

Each press is a write to the same repository, and GitHub throttles bursts of those. A
two-hundred file folder fired at once is a flood, so presses go through **one queue for the
whole page at ten a second**. The first press goes out immediately, so a single file still
feels instant.

The queue is keyed by diff anchor, so the newest intent for a file replaces an older queued
one rather than joining it. Each press also re-reads the toggle at the moment it goes out, and
skips a file already in the wanted state. Together these mean a reversal costs nothing if it
arrives before the press does: reviewing a six file folder and immediately un-reviewing one of
them sends five writes, not seven.

A click decides direction from where the row is **heading**, not the checkmark it currently
shows. A press queued a moment ago has not painted yet, so reading the marker would take a
user reversing their own last click as confirming it, and press the file twice into the same
state.

While a batch drains, the clicked row pulses and refuses another press, and the roll-up sits
out entirely. Judging a folder on every press would call it incomplete all the way through and
complete on the last one, flickering the whole time; the drain runs the single roll-up that is
true when it finishes. The rows underneath still turn green one by one, which is the progress
indicator.

## Why an attribute, and one injected node

The viewed state is recorded as `data-pr-enhancer-viewed` on the row. React rewrites
`className` on every re-render but leaves attributes it never set alone, so an attribute
survives where a class would not.

The button is the one node we inject into React's tree. Rather than trust a single insertion
to last, the sweep re-adds it to any row missing one; a row already carrying its button costs
one shallow query to skip.

### Two update paths

A full sweep re-reads every toggle and repaints the whole sidebar. It runs on the throttled
Files tab cadence, which is the right speed for GitHub streaming more of the pull request in
and far too slow to acknowledge a click the user just made.

So a second path handles the click. A `MutationObserver` keyed to `aria-pressed` repaints the
single row behind the toggle that changed, immediately.

### Rendering

The checkmark is a masked octicon rather than a background image, so it takes the theme's own
`--fgColor-success` in both light and dark mode instead of shipping two copies of the asset.
It is positioned absolutely inside `.PRIVATE_TreeView-item-content`, which is immune to
whether Primer lays that row out with flex or grid, and the slot's `padding-right` holds its
column open so a long file name truncates before reaching it.

## Finished folders check themselves and fold away

A directory whose every descendant file is viewed gets the same checkmark and collapses, so
what stays on screen is what is left to review.

### The rules

- **Descendants, not children.** A folder is finished only when everything beneath it is,
  however deep.
- **Only the outermost finished folder of a branch collapses.** Everything below it folds away
  with it, so collapsing the children too would be wasted work. This is what walks the
  collapse upwards as a review fills in: once the last sibling is viewed, the parent takes
  over from the children it contains. All finished folders still get a checkmark; only the
  outermost one collapses.
- **Once per completion, not once per sweep.** A folder the user reopens to re-read stays
  open. A directory only becomes eligible to collapse again after going incomplete and
  finishing a second time.
- **A collapsed folder keeps its checkmark.** Primer unmounts the children of a collapsed
  directory, so there is nothing left to count; rather than clear a mark it cannot currently
  re-earn, the sweep leaves whatever it last concluded. This also protects folders the user
  collapsed by hand, which would otherwise read as vacuously finished.

Against the captured 400-file review with 18 files viewed, five directories are finished and
three collapse: `.github`, `bifrost/src/common` and `bifrost/src/lib/args`, each the outermost
finished folder of its own branch. `.github/scripts` and `.github/workflows` are finished too
and keep their checkmarks, but `.github` folds them away.

### Collapsing

Primer holds the expanded state in React, so writing `aria-expanded` would only desynchronise
the attribute from the component that owns it. The chevron is clicked instead, exactly as a
user would. The selector for it is scoped with `:scope >`, since an unqualified descendant
search finds the first *nested* directory's chevron rather than the folder's own.

## Rows scrolled out of the sidebar are skipped

See [performance.md](./performance.md).

## Roadmap

- Show a count on unfinished directory rows, so a folder reads "7 of 12" rather than only
  finished or not.
- Offer a filter that hides viewed files from the tree entirely.
