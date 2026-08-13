# File tree sidebar

## Viewed files carry a checkmark

GitHub keeps the "Viewed" state out of the sidebar, so a long review offers no sense of
progress without scrolling the diff column to check. `src/content/fileTreeViewedState.ts`
mirrors each file's toggle onto its tree row: a green octicon check at the end of the row and
a faded file name.

### Where the state comes from

We read the toggle, rather than tracking clicks. That also picks up the state GitHub restores
from the server on load, and anything marked viewed in another tab. The `diff-<sha>` fragment
joins the two halves of the page: the toggle lives inside the file's diff region, and the
tree row links to that same fragment.

### Why an attribute and not a class

The row is marked with `data-pr-enhancer-viewed`, and CSS draws the checkmark off that.

- Injecting our own nodes into a React-owned tree risks the reconciliation crashes that come
  from touching children React believes it owns.
- A class would not survive. React rewrites `className` on every re-render, while leaving
  attributes it never set alone.

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
