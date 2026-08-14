# The GitHub DOM we depend on

Everything the content script matches lives in `src/content/githubSelectors.ts`, so a GitHub
redesign has exactly one file to repair.

## Selector policy

GitHub ships CSS modules, so class names carry a per-build hash: `diffEntry__djnVa` today,
something else after the next deploy. Match the stable `Component-module__name__` prefix and
let the hash float.

Prefer a semantic hook wherever GitHub exposes one (`role`, `aria-pressed`, `id`). Those are
contracts rather than build output.

Primer's `PRIVATE_TreeView-*` class names carry no hash and can be matched directly. They sit
in the same `class` attribute as the hashed `prc-TreeView-*-<hash>` names, so read carefully
before picking one.

Avoid matching on visible text. `aria-label` on the viewed toggle reads "Viewed" or "Not
Viewed" in English and is localized elsewhere; `aria-pressed` is not.

## The contract

### Where the Files UI lives

Both the classic `/files` and the modern `/changes` view can be narrowed to a single commit or
to a range, by appending them to the path:

```
/owner/repo/pull/89/changes
/owner/repo/pull/89/changes/<sha>
/owner/repo/pull/89/files/<sha>..<sha>
```

All of them serve the same DOM, so the route pattern has to accept the suffix or the extension
simply never runs there.

### Diff column

| Thing | How to find it |
| --- | --- |
| Per-file wrapper | `[class*="PullRequestDiffsList-module__diffEntry__"]` |
| File region | `[id^="diff-"]` **inside a wrapper**, id is `diff-<sha of the file path>` |
| Diff line | `tr.diff-line-row` |
| Viewed toggle | `button[class*="MarkAsViewedButton-module__"]`, state on `aria-pressed` |

Both the wrapper and the region carry their own `content-visibility` placeholder, though only
on comparisons big enough for GitHub to bother; a nine file commit view has none.

**`[id^="diff-"]` alone is not a file.** The page also carries `diff-comparison-viewer-container`,
`diff-file-tree-filter` and `diff-placeholder`, none of which are files. Scope to a wrapper.

**The diff header is display text, not data.** It ellipsises a long path down to
`…/common/getUniqueDestinationPath.ts` and spells a rename as `old → new`. On a captured
review, 105 of 397 headers do not yield a usable path. `table[aria-label]` is not ellipsised
and is therefore better, but it only exists for files whose diff body has rendered: 292 of 397
on the same page, and 4 of 9 on a commit view. **There is no complete, reliable list of file
paths in the diff column.** The sidebar's row ids are the only trustworthy source.

### Merge box (conversation tab)

| Thing | How to find it |
| --- | --- |
| Merge box | `[data-testid="mergebox-partial"]`, or `#partial-pull-merging` on the classic UI |
| Merge action | first `button` inside `[data-component="ButtonGroup"]` **inside the merge box** |
| Its label | `[data-component="text"]` inside the button, wrapped across lines |
| Blocked | `aria-disabled="true"` on the button, never the `disabled` property |
| Why blocked | the group's `aria-describedby` points at the tooltip holding the reason |

The merge action must stay scoped to the button group inside the merge box. "Close pull
request" is a button on the same page, outside it.

### File tree sidebar

| Thing | How to find it |
| --- | --- |
| Leaf file row | `[role="treeitem"][class*="DiffFileTree-module__file-tree-row__"]` |
| Directory row | `[role="treeitem"][aria-expanded]` |
| Its path | the row's `id`, for files and directories alike |
| Its diff link | `a[href^="#diff-"]` inside a file row |
| Icon and name slot | `:scope > .PRIVATE_TreeView-item-container > .PRIVATE_TreeView-item-content` |
| Name only | `.PRIVATE_TreeView-item-content-text` inside that slot |
| Directory chevron | `:scope > .PRIVATE_TreeView-item-container > .PRIVATE_TreeView-item-toggle` |

`aria-expanded` partitions the tree exactly: on the captured review, 397 file rows and 109
directory rows account for all 506 tree items, with no row in both sets.

Scope anything aimed at a row's own chrome with `:scope >`, and write CSS for it with child
combinators. A directory row *contains* its descendants, so a descendant selector reaches
every row inside the folder rather than the folder itself.

### The join

The `diff-<sha>` fragment is the only key linking the two halves of the page. A file's real
viewed state lives on the toggle in its diff region; the sidebar row for the same file links
to that fragment.

## Recapturing a sample

Open the tab you need (the **Files changed** tab for the diff and sidebar contract, the
conversation tab for the merge box), let it finish streaming, then in the browser console:

```js
copy(document.documentElement.outerHTML)
```

Save it in the repository root. `sample.html` is the conversation page and
`huge-pr-sample.html` a several-hundred file diff.

**The capture contains the full source of whatever pull request it came from.** `.gitignore`
excludes `*sample*.html` for that reason. Never commit one, and never publish one from a
private repository.

## Verifying selectors without a browser

`jsdom` parses the capture and exercises the joins, which catches a typo'd selector or a
GitHub rename without loading the extension:

```js
import { JSDOM } from 'jsdom'
const { document } = new JSDOM(readFileSync('huge-pr-sample.html', 'utf8')).window

document.querySelectorAll(DIFF_ENTRY_SELECTOR).length     // expect one per file
document.querySelectorAll(FILE_TREE_ROW_SELECTOR).length  // expect one per file
```

Run node with `--max-old-space-size=8192`; the captures run to tens of megabytes.

The built bundle can also be run whole, which catches load-time crashes and lets you assert on
what it produced. Stub `chrome` and `IntersectionObserver`, and construct the DOM with the
`url` of the page you captured, since the script routes on `location.pathname`:

```js
const dom = new JSDOM(readFileSync('sample.html', 'utf8'), {
  url: 'https://github.com/owner/repo/pull/63',
  runScripts: 'outside-only',
  pretendToBeVisual: true
})
dom.window.chrome = { runtime: { getURL: (path) => path } }
dom.window.IntersectionObserver = class { /* capture the callback and fire it by hand */ }
dom.window.eval(readFileSync('dist/content.js', 'utf8'))
```

What this cannot check: jsdom has no layout engine, so every `getBoundingClientRect` returns
zero, `content-visibility` does nothing, and `scrollIntoView` is missing entirely. Height
measurement, scrolling and the rendering wins have to be confirmed in Chrome.
