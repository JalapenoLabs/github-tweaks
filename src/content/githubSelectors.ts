// Copyright © 2026 Jalapeno Labs
//
// Every selector we use to find our way around GitHub's modern "Files changed" page, in one
// place, so a GitHub redesign has exactly one file to repair.
//
// GitHub ships CSS modules, so class names carry a per-build hash: `diffEntry__djnVa` today,
// something else after the next deploy. We match the stable `Component-module__name__`
// prefix and let the hash float. Where GitHub exposes a semantic hook instead (`role`,
// `aria-pressed`, `id`) we use that, because those are contracts rather than build output.

// The per-file wrapper in the diff column. GitHub gives each one a `content-visibility`
// placeholder, which is what keeps a 400-file page renderable at all.
export const DIFF_ENTRY_SELECTOR = '[class*="PullRequestDiffsList-module__diffEntry__"]'

// The region inside each wrapper. Its id is `diff-<sha of the file path>`, which is also the
// fragment the file tree links to, so it is the join key between the two halves of the page.
export const DIFF_REGION_SELECTOR = '[id^="diff-"]'

// One per line of a rendered diff.
export const DIFF_LINE_ROW_SELECTOR = 'tr.diff-line-row'

// The per-file "Viewed" toggle in a diff header. It is a button, not a checkbox, and
// `aria-pressed` carries the state.
export const VIEWED_TOGGLE_SELECTOR = 'button[class*="MarkAsViewedButton-module__"]'
export const VIEWED_TOGGLE_STATE_ATTRIBUTE = 'aria-pressed'

// Leaf rows of the file tree sidebar. Directory rows share the TreeView classes but not this
// one, which matters: a directory row contains its children, so it must never be size
// contained or marked viewed.
export const FILE_TREE_ROW_SELECTOR = '[role="treeitem"][class*="DiffFileTree-module__file-tree-row__"]'
