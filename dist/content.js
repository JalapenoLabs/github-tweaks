"use strict";
(() => {
  // src/constants.ts
  var LOG_PREFIX = "[GitHub PR Enhancer]";
  var RELOCATED_MARKER = "data-pr-enhancer-relocated";
  var PDF_PROCESSED_MARKER = "data-pr-enhancer-pdf";
  var HIDDEN_DIVIDER_MARKER = "data-pr-enhancer-divider-hidden";

  // src/content/mergePanel.ts
  var MERGE_PANEL_SELECTORS = ['[data-testid="mergebox-partial"]', "#partial-pull-merging"];
  var DISCUSSION_SELECTOR = ".js-discussion";
  var TIMELINE_PARTIAL_SELECTOR = '[data-partial-name="pullRequestsConversationsRoute.Timeline"]';
  var TIMELINE_DIVIDER_SELECTOR = ".discussion-timeline-actions";
  function relocateMergePanel() {
    let mergePanel = null;
    for (const selector of MERGE_PANEL_SELECTORS) {
      mergePanel = document.querySelector(selector);
      if (mergePanel) {
        break;
      }
    }
    if (!mergePanel) {
      return false;
    }
    const discussion = document.querySelector(DISCUSSION_SELECTOR);
    if (!discussion?.parentElement) {
      console.debug(LOG_PREFIX, "Could not find the discussion timeline to anchor the merge panel above");
      return false;
    }
    const isAlreadyRelocated = mergePanel.getAttribute(RELOCATED_MARKER) === "true";
    if (isAlreadyRelocated && mergePanel.nextElementSibling === discussion) {
      return true;
    }
    mergePanel.setAttribute(RELOCATED_MARKER, "true");
    mergePanel.classList.add("pr-enhancer-merge-panel");
    discussion.parentElement.insertBefore(mergePanel, discussion);
    console.debug(LOG_PREFIX, "Relocated merge panel above the conversation timeline");
    return true;
  }
  function hideTrailingTimelineDivider() {
    const timeline = document.querySelector(TIMELINE_PARTIAL_SELECTOR);
    if (!timeline) {
      return;
    }
    const dividers = timeline.querySelectorAll(TIMELINE_DIVIDER_SELECTOR);
    const lastDivider = dividers[dividers.length - 1];
    if (!lastDivider || lastDivider.getAttribute(HIDDEN_DIVIDER_MARKER) === "true") {
      return;
    }
    lastDivider.setAttribute(HIDDEN_DIVIDER_MARKER, "true");
    lastDivider.style.display = "none";
    console.debug(LOG_PREFIX, "Hid the trailing empty discussion-timeline-actions divider");
  }

  // src/content/pdfPreview.ts
  var BINARY_NOTICE_TEXT = "Binary file not shown.";
  var PREVIEW_HEIGHT_PX = 800;
  var DIRECTIONAL_MARKS_PATTERN = /[‎‏‪-‮⁦-⁩]/g;
  function renderPdfPreviews() {
    const noticeElements = document.querySelectorAll("[data-diff-anchor]");
    for (const notice of noticeElements) {
      if (notice.textContent?.trim() !== BINARY_NOTICE_TEXT) {
        continue;
      }
      const body = notice.parentElement;
      if (!body || body.getAttribute(PDF_PROCESSED_MARKER) === "true") {
        continue;
      }
      const diffAnchor = notice.getAttribute("data-diff-anchor");
      if (!diffAnchor) {
        continue;
      }
      const container = document.getElementById(diffAnchor);
      if (!container) {
        console.debug(LOG_PREFIX, "Could not find the diff container for a binary file", diffAnchor);
        continue;
      }
      const path = extractFilePath(container, diffAnchor);
      if (!path.toLowerCase().endsWith(".pdf")) {
        continue;
      }
      const refs = getHeadRefs();
      if (!refs) {
        console.debug(LOG_PREFIX, "Could not determine the pull request head ref; skipping PDF preview", path);
        continue;
      }
      body.setAttribute(PDF_PROCESSED_MARKER, "true");
      notice.style.display = "none";
      body.appendChild(buildPreview(buildRawUrl(refs, path)));
      console.debug(LOG_PREFIX, "Rendered inline PDF preview for", path);
    }
  }
  function extractFilePath(container, diffAnchor) {
    const headerLink = container.querySelector(`a[href="#${diffAnchor}"]`);
    const code = headerLink?.querySelector("code") ?? container.querySelector("h3 code");
    const rawText = code?.textContent ?? "";
    return rawText.replace(DIRECTIONAL_MARKS_PATTERN, "").trim();
  }
  function buildRawUrl(refs, path) {
    const encodedPath = path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
    return `https://github.com/${refs.owner}/${refs.repo}/raw/${refs.sha}/${encodedPath}`;
  }
  function buildPreview(rawUrl) {
    const container = document.createElement("div");
    container.className = "pr-enhancer-pdf";
    const toolbar = document.createElement("div");
    toolbar.className = "pr-enhancer-pdf-toolbar";
    const openLink = document.createElement("a");
    openLink.href = rawUrl;
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    openLink.textContent = "Open PDF in new tab";
    toolbar.appendChild(openLink);
    const frame = document.createElement("iframe");
    frame.className = "pr-enhancer-pdf-frame";
    frame.height = String(PREVIEW_HEIGHT_PX);
    frame.src = `${chrome.runtime.getURL("viewer.html")}?file=${encodeURIComponent(rawUrl)}`;
    container.append(toolbar, frame);
    return container;
  }
  var cachedRefs = null;
  var cachedRefsKey = "";
  function getHeadRefs() {
    const key = window.location.pathname;
    if (cachedRefs && cachedRefsKey === key) {
      return cachedRefs;
    }
    const refs = findHeadRefs();
    if (refs) {
      cachedRefs = refs;
      cachedRefsKey = key;
    }
    return refs;
  }
  function findHeadRefs() {
    const scripts = document.querySelectorAll(
      'script[type="application/json"][data-target$="embeddedData"]'
    );
    for (const script of scripts) {
      let data;
      try {
        data = JSON.parse(script.textContent ?? "");
      } catch (error) {
        console.debug(LOG_PREFIX, "Failed to parse an embedded data script", error);
        continue;
      }
      const match = findObjectWithKeys(data, ["headSha", "headRepositoryOwnerLogin", "headRepositoryName"]);
      if (match) {
        return {
          owner: String(match.headRepositoryOwnerLogin),
          repo: String(match.headRepositoryName),
          sha: String(match.headSha)
        };
      }
    }
    return null;
  }
  function findObjectWithKeys(value, keys) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findObjectWithKeys(item, keys);
        if (found) {
          return found;
        }
      }
      return null;
    }
    if (value && typeof value === "object") {
      const record = value;
      if (keys.every((key) => typeof record[key] === "string")) {
        return record;
      }
      for (const nested of Object.values(record)) {
        const found = findObjectWithKeys(nested, keys);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  // src/content/index.ts
  var PULL_CONVERSATION_PATTERN = /^\/[^/]+\/[^/]+\/pull\/\d+\/?$/;
  var PULL_FILES_PATTERN = /^\/[^/]+\/[^/]+\/pull\/\d+\/(files|changes)\/?$/;
  function runEnhancements() {
    const pathname = window.location.pathname;
    if (PULL_CONVERSATION_PATTERN.test(pathname)) {
      if (relocateMergePanel()) {
        hideTrailingTimelineDivider();
      }
    }
    if (PULL_FILES_PATTERN.test(pathname)) {
      renderPdfPreviews();
    }
  }
  var scheduledFrame = 0;
  function scheduleRun() {
    if (scheduledFrame) {
      return;
    }
    scheduledFrame = window.requestAnimationFrame(() => {
      scheduledFrame = 0;
      runEnhancements();
    });
  }
  var observer = new MutationObserver(scheduleRun);
  observer.observe(document.body, { childList: true, subtree: true });
  console.debug(LOG_PREFIX, "Content script initialized");
  runEnhancements();
})();
