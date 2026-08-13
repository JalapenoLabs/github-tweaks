# Performance on large pull requests

Scope: the modern "Files changed" UI at `/pull/<n>/changes`, on reviews of several hundred
files.

## What GitHub already does

GitHub virtualizes the diff column itself, and does it correctly. Every per-file wrapper
carries:

```css
content-visibility: auto;
contain-intrinsic-size: auto <n>px;
```

`content-visibility: auto` lets the browser skip style, layout, paint and hit-testing for a
file that is off-screen. `contain-intrinsic-size` tells it how much room to hold open in that
file's place. The DOM stays intact, so find-in-page, deep links and React all keep working.

We do not replace this. Windowing the list ourselves would mean detaching nodes React still
believes it owns, which causes reconciliation crashes.

## What we fix

### Undersized placeholders

The reservations GitHub computes are sometimes wrong by orders of magnitude. On a captured
400-file review, the `yarn.lock` entry reserves **175px for roughly 49,000px** of real
content.

The consequence is not a cosmetic one. Whenever that file drifts near the viewport the
browser materializes it and the document grows by 49,000px in a single frame; scrolling away
collapses it again. The scrollbar leaps, scroll anchoring fights the change, and every swing
costs a full re-layout of the list. This is the stutter reviewers feel, and it is why marking
a file viewed mid-page can throw the scroll position somewhere else entirely.

`src/content/diffPlaceholders.ts` corrects it. A skipped file's rows are still in the DOM, so
it counts them without rendering anything, multiplies by a row height measured from a file
that is on screen, and writes an honest reservation to both the wrapper and the region nested
inside it (each carries its own placeholder, and correcting one alone still lets the file
collapse).

Decisions:

- **Keep the `auto` keyword.** The browser replaces our estimate with the true height the
  first time it renders the file, so the estimate only has to survive the first encounter.
- **Only grow, never shrink.** A file with no mounted rows is collapsed or unfetched, and
  GitHub's estimate is better informed than ours.
- **Only correct shortfalls over 1000px.** A file that renders a few hundred pixels taller
  than promised is not worth a mutation. Against the captured sample this touches 2 entries
  out of 397.
- **Row height is measured, not assumed.** Rows inside a skipped file report a zero-height
  rect, which doubles as the test for whether a file is rendered, so the first non-zero row
  found is by definition a real measurement. The 24px fallback applies only until one is.

### An unvirtualized file tree

GitHub leaves the sidebar alone, so a 400-file review lays out and paints 400 tree rows on
every sidebar scroll. Leaf rows are a uniform height and hold nothing that overflows them (no
tooltips, no popovers, no nested lists), so `content-visibility` is safe there and needs no
script at all. The rule lives in `src/content/content.css`.

Leaf rows only. A directory row carries its children inside it, and size containment would
collapse the whole subtree.

### Sweep cadence

The Files tab enhancements each walk the diff column, which is a few milliseconds on a
several-hundred file page. GitHub mutates that column constantly while you interact with it,
so sweeping once per mutation frame would itself become a source of jank. `src/content/index.ts`
throttles the sweep to one run every 400ms with a trailing run queued behind each burst.

Marking a file viewed is exempt. It flips `aria-pressed` and nothing else the structural
observer watches, so a second observer keyed to that one attribute updates the sidebar
immediately rather than waiting out the interval.

## Verifying a change

Selector and arithmetic changes can be checked without a browser against a captured page. See
[github-dom.md](./github-dom.md).
