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

// Directory rows. `aria-expanded` partitions the tree exactly: on a captured 400-file review,
// 397 file rows and 109 directory rows account for all 506 tree items with no overlap. A
// directory's `id` is its path, and its descendants are nested inside it.
export const FILE_TREE_DIRECTORY_SELECTOR = '[role="treeitem"][aria-expanded]'

// A directory's own chevron. Scoping to `:scope >` matters: an unqualified descendant search
// would find the toggle of the first nested directory instead.
export const FILE_TREE_TOGGLE_SELECTOR =
  ':scope > .PRIVATE_TreeView-item-container > .PRIVATE_TreeView-item-toggle'

// Every row, of either kind. The two selectors above partition this set exactly.
export const FILE_TREE_ITEM_SELECTOR = '[role="treeitem"]'

// Where a row renders its icon and name, and where we hang the review button. Scoped to the
// row's own chrome, which excludes a directory's children: the nested list of children is a
// sibling of this container, not a descendant of it.
export const FILE_TREE_CONTENT_SLOT_SELECTOR =
  ':scope > .PRIVATE_TreeView-item-container > .PRIVATE_TreeView-item-content'

// The merge box on the conversation tab. The first selector is the modern React UI, the
// second the classic markup kept as a fallback.
export const MERGE_PANEL_SELECTORS = ['[data-testid="mergebox-partial"]', '#partial-pull-merging']

// The merge action itself is the first button of the one Primer button group inside the merge
// box; the second slot in that group holds the dropdown for picking a different merge method.
// Scoping this tightly matters, because "Close pull request" is a button too. It sits outside
// the merge box, and this selector must never reach it.
export const MERGE_BUTTON_GROUP_SELECTOR = '[data-component="ButtonGroup"]'

// Primer nests a button's visible label rather than leaving it as the button's own text, and
// wraps it across lines, so read this and collapse the whitespace.
export const BUTTON_LABEL_SELECTOR = '[data-component="text"]'

// Primer disables a button with `aria-disabled` rather than the `disabled` property, so the
// control stays focusable and can still explain itself. Reading `.disabled` reports false on
// a button that plainly is not clickable.
export const ARIA_DISABLED_ATTRIBUTE = 'aria-disabled'
