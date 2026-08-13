# Developer guide

Everything technical. For what the extension does and why anyone would want it, see the
[README](README.md).

## Requirements

Node 20 or newer, and Chrome 120 or newer. Nothing else; the build has no native dependencies
and no image tooling.

## Getting started

```bash
npm install
npm run build      # bundles into ./dist
```

Then load it:

1. Open `chrome://extensions` and turn on **Developer mode**.
2. **Load unpacked**, and select `dist`.
3. Open any pull request.

After editing, run `npm run build` again and press reload on the extension card. Or leave
`npm run watch` running, which rebuilds on change; you still press reload.

## Scripts

| Command | Does |
| --- | --- |
| `npm run build` | Bundles `src` into `dist` and copies the manifest, stylesheet, viewer page and icons |
| `npm run watch` | The same, rebuilding on change |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run icons` | Redraws `icons/*.png` from `tools/generate-icons.mjs` |
| `npm run package` | Builds, then zips `dist` into `github-pr-enhancer-<version>.zip` for the store |

## Layout

```
src/
  constants.ts              marker attributes, class names, log prefix
  content/
    index.ts                entry point: routing, the sweep, the observers
    githubSelectors.ts      every selector we match GitHub with
    mergePanel.ts           moves the merge box above the timeline
    mergeDock.ts            the floating dock on the conversation tab
    diffPlaceholders.ts     corrects the reserved height of off-screen files
    fileTreeViewedState.ts  review state and the sidebar checkmarks
    pdfPreview.ts           swaps binary PDF placeholders for the viewer
    content.css             all injected styling
  viewer/                   extension-origin page that renders the PDF bytes
tools/
  generate-icons.mjs        draws the icon at each size, straight to PNG
  package-extension.mjs     writes the store upload zip
  crc32.mjs                 shared by both of the above
docs/                       design decisions, one file per area
```

## How it hangs together

GitHub renders pull requests as a Turbo-driven single-page app, so a one-shot DOM pass is not
enough. `content/index.ts` re-runs the enhancements whenever the DOM settles, and every one of
them is idempotent.

Three things drive work:

- **A `MutationObserver` on `childList`**, coalesced to one run per animation frame. This
  handles the page streaming in.
- **A 400ms throttle on the Files tab sweep.** Those enhancements walk the whole diff column,
  which is a few milliseconds on a several-hundred file page. GitHub mutates that column
  constantly while you interact with it, so sweeping every frame was itself a source of jank.
- **A second `MutationObserver` on `aria-pressed`.** Marking a file viewed changes nothing the
  structural observer watches, and the sweep is far too slow to acknowledge a click. This path
  answers immediately.

Design decisions live in [`docs/`](docs/), one file per area:

- [conversation-tab.md](docs/conversation-tab.md) — the relocated merge panel and the dock
- [performance.md](docs/performance.md) — why large pull requests stutter and what is done
- [file-tree.md](docs/file-tree.md) — the sidebar: review state, checkmarks, folder rollup
- [github-dom.md](docs/github-dom.md) — the DOM contract, and how to re-derive it

## Working against GitHub's DOM

GitHub ships CSS modules, so class names carry a per-build hash: `diffEntry__djnVa` today,
something else after the next deploy. Match the stable `Component-module__name__` prefix and
let the hash float. Prefer a semantic hook (`role`, `aria-pressed`, `id`) wherever GitHub
exposes one.

Every selector lives in `src/content/githubSelectors.ts`, so a GitHub redesign has exactly one
file to repair. Do not scatter them.

## Testing

There is no test runner. There is something better suited to the problem: the extension is
driven against a **captured GitHub page** in `jsdom`, which catches load-time crashes, broken
selectors, and logic errors without a browser.

Capture a page by opening the tab you need, letting it finish streaming, and running this in
the console:

```js
copy(document.documentElement.outerHTML)
```

Save it in the repository root. `sample.html` is a conversation page and `huge-pr-sample.html`
a several-hundred file diff. **`.gitignore` excludes `*sample*.html` and it must stay that
way:** a capture contains the full source of whatever pull request it came from.

Then drive the built bundle:

```js
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'

const dom = new JSDOM(readFileSync('huge-pr-sample.html', 'utf8'), {
  // The content script routes on location.pathname, so this has to match the captured page.
  url: 'https://github.com/owner/repo/pull/63/changes',
  runScripts: 'outside-only',
  pretendToBeVisual: true
})

dom.window.chrome = { runtime: { getURL: (path) => path } }
dom.window.IntersectionObserver = class { observe() {} disconnect() {} }
dom.window.eval(readFileSync('dist/content.js', 'utf8'))
```

Give it ~500ms for the throttled sweep, then assert against `dom.window.document`. Run node
with `--max-old-space-size=8192`; captures run to tens of megabytes.

To exercise anything interactive, stand in for the parts of GitHub that are not there. Attach
a listener to each `button[class*="MarkAsViewedButton-module__"]` that flips its own
`aria-pressed`, and one to each `.PRIVATE_TreeView-item-toggle` that flips `aria-expanded` and
detaches or restores the child list, which is what React does.

**What this cannot check.** jsdom has no layout engine and no React. Every
`getBoundingClientRect` returns zero, `content-visibility` does nothing, `scrollIntoView` does
not exist, and whether Primer actually reacts to a synthetic click is unknowable here. Height
measurement, scroll behaviour, and the rendering wins have to be confirmed in Chrome.

## Debugging

Every message the extension emits is prefixed `[GitHub PR Enhancer]`. Filter the console on it.
Useful lines to look for on a large diff:

```
Calibrated the diff row height to 24px
Reserved auto 49050px for diff-51e4f55…
Collapsed a fully reviewed directory: .github
Queued 6 viewed toggle(s) under electron/src/common
```

## Icons

`npm run icons` redraws `icons/*.png`. The mark is described as maths in a unit square in
`tools/generate-icons.mjs`, so each size is drawn at its own resolution rather than resampled
down from a large one, which is what keeps 16px legible. Edit the constants at the top of that
file to change it. The PNGs are committed so a plain build needs no image tooling.

## Releasing

1. Bump `version` in **both** `package.json` and `manifest.json`. The store rejects an upload
   whose version is not higher than the published one.
2. `npm run typecheck`
3. Verify in Chrome. The jsdom pass cannot cover rendering, and rendering is most of what this
   extension does.
4. `npm run package`
5. Upload the zip at the
   [Chrome Web Store dashboard](https://chrome.google.com/webstore/devconsole).

The archive is reproducible: entries carry a fixed timestamp, so the same `dist` always
produces identical bytes. If a re-package produces the same file, nothing changed.

## Conventions

- No semicolons. K&R `catch`. Named function declarations for exports.
- No default exports and no glob imports.
- Lines under 120 characters.
- Never return early in silence. Log what was unexpected, and say plainly in a comment when an
  early return is the expected case.
- Comments explain **why**. The code already says what.
