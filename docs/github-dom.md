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

### Diff column

| Thing | How to find it |
| --- | --- |
| Per-file wrapper | `[class*="PullRequestDiffsList-module__diffEntry__"]` |
| File region | `[id^="diff-"]`, id is `diff-<sha of the file path>` |
| Diff line | `tr.diff-line-row` |
| Viewed toggle | `button[class*="MarkAsViewedButton-module__"]`, state on `aria-pressed` |

Both the wrapper and the region carry their own `content-visibility` placeholder.

### File tree sidebar

| Thing | How to find it |
| --- | --- |
| Leaf file row | `[role="treeitem"][class*="DiffFileTree-module__file-tree-row__"]` |
| Its file path | the row's `id` |
| Its diff link | `a[href^="#diff-"]` inside the row |
| Icon and name slot | `.PRIVATE_TreeView-item-content` |
| Name only | `.PRIVATE_TreeView-item-content-text` |

Directory rows share the TreeView classes but not `file-tree-row`.

### The join

The `diff-<sha>` fragment is the only key linking the two halves of the page. A file's real
viewed state lives on the toggle in its diff region; the sidebar row for the same file links
to that fragment.

## Recapturing a sample

Open a large pull request's **Files changed** tab, let it finish streaming, then in the
browser console:

```js
copy(document.documentElement.outerHTML)
```

Save it in the repository root as `huge-pr-sample.html`.

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

What this cannot check: jsdom has no layout engine, so every `getBoundingClientRect` returns
zero and `content-visibility` does nothing. Height measurement and the rendering wins have to
be confirmed in Chrome.
