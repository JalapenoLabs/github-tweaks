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

## Rows scrolled out of the sidebar are skipped

See [performance.md](./performance.md).

## Roadmap

- Roll the viewed count into the tree's directory rows, so a folder shows how many of its
  files are done.
- Offer a filter that hides viewed files from the tree entirely.
