# GitHub PR Enhancer

A small Chrome extension (Manifest V3, TypeScript) that improves GitHub pull request pages:

1. **Merge panel on top.** On a pull request's Conversation tab, the squash/merge panel is
   moved from the bottom of the page to just above the discussion timeline, so you can merge
   without scrolling past every comment.
2. **Inline PDF diffs.** On the Files changed tab, PDF files that GitHub renders as
   `Binary file not shown` are replaced with an inline preview of the new version of the
   file, plus an "Open PDF in new tab" link. Works for private repositories too.

## Build

```bash
npm install
npm run build      # outputs the loadable extension into ./dist
npm run watch      # rebuild on change while developing
npm run typecheck  # tsc --noEmit
```

## Load it into Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `dist/` folder.
5. Open any pull request, for example a Conversation page or its **Files changed** tab.

After editing the source, run `npm run build` again (or keep `npm run watch` running) and
press the reload icon on the extension card in `chrome://extensions`.

## How it works

- `src/content` is the content script injected into `github.com`. It relocates the merge
  panel and swaps PDF placeholders for an iframe pointing at the extension's own viewer.
- `src/viewer` is an extension-origin page. Running outside the github.com origin lets it
  fetch the raw PDF bytes (with your GitHub session cookies, so private repos work) and feed
  them to Chrome's native PDF viewer, sidestepping github.com's Content-Security-Policy.

GitHub renders pull requests as a Turbo-driven single-page app, so the content script
re-applies its changes idempotently whenever the DOM updates.
