# Privacy Policy

**GitHub PR Enhancer**
Last updated: 13 August 2026

## The short version

The extension collects nothing, stores nothing, and sends nothing anywhere. It has no
servers, no analytics, and no accounts. Everything it does happens inside your browser tab.

## What it accesses

The extension runs only on `https://github.com/*`. It reads and modifies the page you are
already looking at, to reposition the merge panel, correct the rendering placeholders on large
diffs, and mirror each file's "Viewed" state onto the file tree sidebar.

Marking a file reviewed from the sidebar works by pressing GitHub's own "Viewed" button on
that file. The request goes from GitHub's page to GitHub, exactly as if you had clicked it
yourself. The extension is not a party to it.

## Network requests

The extension makes one kind of request of its own. When a pull request contains a PDF that
GitHub will not display, the extension's viewer page fetches that file so it can be shown
inline.

- The request goes to `github.com` or `*.githubusercontent.com`, and nowhere else. The
  destination is checked against that allowlist before the fetch is made.
- It carries your existing GitHub session cookies, which is what allows PDFs in private
  repositories to render. This is the same credential your browser already sends to GitHub.
- The response is handed to Chrome's built-in PDF viewer and discarded. It is not uploaded,
  cached by the extension, or inspected.

No request is ever made to Jalapeno Labs or to any third party.

## Data storage

None. The extension uses no `chrome.storage`, no cookies of its own, no `localStorage`, and no
`IndexedDB`. What state it keeps lives in memory for the lifetime of the tab and is gone when
you close it.

## Permissions, and why each is needed

| Permission | Why |
| --- | --- |
| `https://github.com/*` | To run on pull request pages, which is the entire function of the extension, and to fetch PDF files from the repository you are viewing. |
| `https://*.githubusercontent.com/*` | GitHub redirects raw file downloads to this domain. Without it, the PDF fetch above fails at the redirect. |

The extension requests no other permissions. It has no `storage`, no `tabs`, no `cookies`, no
`scripting`, and no background service worker.

## Sale or sharing of data

There is no data to sell or share. Jalapeno Labs does not receive any information about you or
your repositories from this extension.

## Changes

Any change to this policy will be committed to the
[repository](https://github.com/JalapenoLabs/github-tweaks/blob/main/PRIVACY.md), where its
full history is visible.

## Contact

Alex Navarro, Jalapeno Labs. alex@jalapenolabs.io
