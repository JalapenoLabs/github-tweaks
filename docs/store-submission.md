# Chrome Web Store submission

Every dashboard field, with the answer to paste. Field names track the console as of August
2026; the grouping shifts occasionally, the substance does not.

Keep this file in step with `manifest.json` and `PRIVACY.md`. A listing that contradicts the
privacy policy is one of the more common rejections.

## Store listing

**Title** — pulled from `manifest.json`.

```
GitHub PR Enhancer
```

**Summary** (132 max) — also pulled from `manifest.json`, no need to retype.

```
Smooth scrolling on huge pull requests, review tracking in the file tree, a merge shortcut, and inline PDF diffs.
```

**Category**

```
Developer Tools
```

**Language**

```
English (United States)
```

**Description**

```
A 400-file pull request should not fight you. GitHub PR Enhancer fixes the parts of GitHub's review UI that fall apart at scale.

SCROLLING STOPS STUTTERING
GitHub reserves a placeholder for every file scrolled out of view, and sometimes gets the size badly wrong. On one real review a yarn.lock entry reserved 175 pixels for roughly 49,000 pixels of content, so the page grew by 49,000 pixels in a single frame every time it drifted past the viewport, then collapsed again on the way back. That is the lurch you feel, and it is why checking a box can throw you somewhere else entirely. This extension measures what is really there and reserves honestly. It also lets the browser skip file tree rows scrolled out of the sidebar, which GitHub does not do at all.

TRACK YOUR REVIEW FROM THE SIDEBAR
Every file's "Viewed" state appears on its row in the file tree, so progress is visible at a glance instead of requiring a scroll through the diff to find out. Hover any row and a checkmark appears: press it to mark that file reviewed, or press a folder's to mark everything inside it. Press a green one to undo.

FINISHED FOLDERS FOLD THEMSELVES AWAY
When every file under a folder is reviewed, the folder checks itself and collapses, upwards as far as the review is finished. What stays on screen is what is left to read.

MERGE WITHOUT SCROLLING TO THE BOTTOM
The merge panel moves to the top of the conversation, above the discussion instead of below all of it. Scroll down and a dock appears in the bottom left with "Back to top" and your repository's merge action, whether that is squash, rebase, or a merge commit. The dock's button mirrors the real one and presses it for you, so GitHub's usual commit message confirmation still follows and nothing merges behind your back.

PDFS RENDER INLINE
PDF files that GitHub shows as "Binary file not shown." are replaced with an inline preview of the new version, plus a link to open it in a tab. Private repositories included.

PRIVACY
No account, no servers, no analytics. The extension collects nothing, stores nothing, and sends nothing anywhere. Everything it does happens inside your browser tab. Full policy: https://github.com/JalapenoLabs/github-tweaks/blob/main/PRIVACY.md

Open source under the MIT license: https://github.com/JalapenoLabs/github-tweaks

Not affiliated with, endorsed by, or sponsored by GitHub, Inc. "GitHub" is a trademark of GitHub, Inc., used only to describe what this extension works with.
```

### Graphic assets

| Asset | Size | Status |
| --- | --- | --- |
| Store icon | 128×128 | `icons/icon-128.png` |
| Screenshots (1 to 5) | 1280×800 or 640×400 | **Needed.** See the warning below |
| Small promo tile | 440×280 | Optional |
| Marquee promo tile | 1400×560 | Optional, featured placement only |

> **The screenshots in `screenshots/` cannot be used.** They show file paths, branch names and
> a title from a private repository, and the listing is public. Retake them against a public
> pull request. They are also the wrong dimensions.

### Additional fields

| Field | Value |
| --- | --- |
| Homepage URL | `https://github.com/JalapenoLabs/github-tweaks` |
| Support URL | `https://github.com/JalapenoLabs/github-tweaks/issues` |
| Mature content | No |

## Privacy

**Single purpose**

The policy requires one narrow purpose. Every feature here has to visibly serve it, so state
the purpose as the review experience rather than listing the features.

```
The single purpose of this extension is to improve the experience of reviewing a pull request on github.com. Every feature serves that one job: correcting the placeholder sizes that make large diffs stutter while scrolling, surfacing each file's review state in the file tree sidebar and letting the reviewer set it from there, placing the merge action within reach of the reviewer instead of below the entire discussion, and rendering PDF diffs that GitHub otherwise refuses to display. The extension does nothing on any other site and has no function outside a pull request page.
```

**Permission justification** — there are no API permissions to justify. Only the host access:

```
The extension's entire function is reading and modifying GitHub pull request pages, so it needs access to github.com to run at all. It also fetches PDF files from the repository being viewed, so that PDF diffs GitHub declines to render can be shown inline. GitHub redirects raw file downloads to githubusercontent.com, so without access to that domain the fetch fails at the redirect. The destination of every such request is checked against these two hosts before it is made. No other host is requested, and the extension has no background service worker, no storage, and no access to tabs, cookies, or scripting.
```

**Remote code**

```
No, I am not using remote code
```

Correct: everything ships in the package. The extension injects no scripts and evaluates
nothing fetched at runtime.

**Data usage** — leave every category unchecked:

Personally identifiable information · Health information · Financial and payment information ·
Authentication information · Personal communications · Location · Web history · User activity ·
Website content

> One to have an answer ready for. The PDF viewer's fetch carries the user's existing GitHub
> session cookies, which is what lets PDFs in private repositories render. That is **not**
> collecting authentication information: the browser attaches its own cookies to a request
> aimed at the site they belong to, the extension never reads them, and nothing is stored or
> transmitted anywhere else. If a reviewer raises it, that is the answer, and `PRIVACY.md`
> already says so.

**Certifications** — all three are true, tick all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**

```
https://github.com/JalapenoLabs/github-tweaks/blob/main/PRIVACY.md
```

## Distribution

| Field | Value |
| --- | --- |
| Payments | Free |
| Visibility | Public |
| Distribution regions | All regions |

## Before hitting submit

- [ ] Screenshots retaken against a **public** repository, at 1280×800 or 640×400
- [ ] `version` bumped in both `package.json` and `manifest.json` if this is not the first upload
- [ ] `npm run typecheck`
- [ ] Loaded unpacked in Chrome and exercised on a real pull request
- [ ] `npm run package`, then upload `github-pr-enhancer-<version>.zip`
- [ ] Repository tagged to match the uploaded version

## Expect breakage

The extension matches GitHub's own DOM, which GitHub redeploys without notice. Selectors are
all in `src/content/githubSelectors.ts` so a repair is contained, but plan on the occasional
patch release. See [github-dom.md](./github-dom.md) for how to re-derive the contract from a
captured page.
