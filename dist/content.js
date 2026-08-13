"use strict";
(() => {
  // src/constants.ts
  var LOG_PREFIX = "[GitHub PR Enhancer]";
  var RELOCATED_MARKER = "data-pr-enhancer-relocated";
  var PDF_PROCESSED_MARKER = "data-pr-enhancer-pdf";
  var HIDDEN_DIVIDER_MARKER = "data-pr-enhancer-divider-hidden";
  var VIEWED_TREE_ROW_MARKER = "data-pr-enhancer-viewed";

  // src/content/githubSelectors.ts
  var DIFF_ENTRY_SELECTOR = '[class*="PullRequestDiffsList-module__diffEntry__"]';
  var DIFF_REGION_SELECTOR = '[id^="diff-"]';
  var DIFF_LINE_ROW_SELECTOR = "tr.diff-line-row";
  var VIEWED_TOGGLE_SELECTOR = 'button[class*="MarkAsViewedButton-module__"]';
  var VIEWED_TOGGLE_STATE_ATTRIBUTE = "aria-pressed";
  var FILE_TREE_ROW_SELECTOR = '[role="treeitem"][class*="DiffFileTree-module__file-tree-row__"]';
  var MERGE_PANEL_SELECTORS = ['[data-testid="mergebox-partial"]', "#partial-pull-merging"];
  var MERGE_BUTTON_GROUP_SELECTOR = '[data-component="ButtonGroup"]';
  var BUTTON_LABEL_SELECTOR = '[data-component="text"]';
  var ARIA_DISABLED_ATTRIBUTE = "aria-disabled";

  // src/content/mergePanel.ts
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

  // src/content/mergeDock.ts
  var BACK_TO_TOP_LABEL = "Back to top";
  var dock = null;
  var isOnConversationPage = false;
  var isPageScrolledToTop = true;
  function ensureMergeDock() {
    isOnConversationPage = true;
    if (dock && (!dock.container.isConnected || !dock.sentinel.isConnected)) {
      dock.scrollObserver.disconnect();
      dock.container.remove();
      dock.sentinel.remove();
      dock = null;
    }
    if (!dock) {
      dock = buildDock();
    }
    syncMergeButton(dock);
    refreshDockVisibility();
  }
  function hideMergeDock() {
    isOnConversationPage = false;
    refreshDockVisibility();
  }
  function refreshDockVisibility() {
    if (!dock) {
      return;
    }
    dock.container.hidden = !isOnConversationPage || isPageScrolledToTop;
  }
  function buildDock() {
    const container = document.createElement("div");
    container.className = "pr-enhancer-dock";
    container.hidden = true;
    const backToTop = document.createElement("button");
    backToTop.type = "button";
    backToTop.className = "pr-enhancer-dock-button pr-enhancer-dock-back-to-top";
    backToTop.textContent = BACK_TO_TOP_LABEL;
    backToTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    const merge = document.createElement("button");
    merge.type = "button";
    merge.className = "pr-enhancer-dock-button pr-enhancer-dock-merge";
    merge.addEventListener("click", forwardClickToMergeButton);
    container.append(backToTop, merge);
    document.body.appendChild(container);
    const sentinel = document.createElement("div");
    sentinel.className = "pr-enhancer-scroll-sentinel";
    document.body.prepend(sentinel);
    const scrollObserver = new IntersectionObserver((entries) => {
      isPageScrolledToTop = entries[entries.length - 1].isIntersecting;
      refreshDockVisibility();
    });
    scrollObserver.observe(sentinel);
    return { container, merge, sentinel, scrollObserver };
  }
  function forwardClickToMergeButton() {
    const panel = findMergePanel();
    const mergeButton = findMergeButton();
    if (!panel || !mergeButton) {
      console.debug(LOG_PREFIX, "The merge button went away before the dock could forward a click");
      return;
    }
    mergeButton.click();
    window.requestAnimationFrame(() => {
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
  function syncMergeButton(currentDock) {
    const mergeButton = findMergeButton();
    if (!mergeButton) {
      currentDock.merge.hidden = true;
      return;
    }
    currentDock.merge.hidden = false;
    const label = mergeButton.querySelector(BUTTON_LABEL_SELECTOR)?.textContent?.replace(/\s+/g, " ").trim();
    if (!label) {
      console.debug(LOG_PREFIX, "The merge button has no readable label", mergeButton);
    } else if (currentDock.merge.textContent !== label) {
      currentDock.merge.textContent = label;
    }
    const isDisabled = mergeButton.getAttribute(ARIA_DISABLED_ATTRIBUTE) === "true" || mergeButton.disabled;
    if (currentDock.merge.disabled !== isDisabled) {
      currentDock.merge.disabled = isDisabled;
    }
    const reason = isDisabled ? readBlockedReason(mergeButton) : "";
    if (currentDock.merge.title !== reason) {
      currentDock.merge.title = reason;
    }
  }
  function readBlockedReason(mergeButton) {
    const describedBy = mergeButton.closest(MERGE_BUTTON_GROUP_SELECTOR)?.getAttribute("aria-describedby");
    if (!describedBy) {
      return "";
    }
    return document.getElementById(describedBy)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  }
  function findMergePanel() {
    for (const selector of MERGE_PANEL_SELECTORS) {
      const panel = document.querySelector(selector);
      if (panel) {
        return panel;
      }
    }
    return null;
  }
  function findMergeButton() {
    const group = findMergePanel()?.querySelector(MERGE_BUTTON_GROUP_SELECTOR);
    if (!group) {
      return null;
    }
    return group.querySelector("button");
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

  // src/content/diffPlaceholders.ts
  var HEADER_HEIGHT_PX = 42;
  var FALLBACK_ROW_HEIGHT_PX = 24;
  var MIN_SHORTFALL_PX = 1e3;
  var evaluatedReservations = /* @__PURE__ */ new WeakMap();
  var measuredRowHeight = 0;
  function reserveAccurateDiffHeights() {
    const entries = document.querySelectorAll(DIFF_ENTRY_SELECTOR);
    if (!entries.length) {
      return;
    }
    const rowHeight = measureDiffRowHeight(entries);
    const corrections = [];
    for (const entry of entries) {
      const reservedHeight = readReservedHeight(entry);
      if (evaluatedReservations.get(entry) === reservedHeight) {
        continue;
      }
      const rowCount = entry.querySelectorAll(DIFF_LINE_ROW_SELECTOR).length;
      const renderedHeight = HEADER_HEIGHT_PX + rowCount * rowHeight;
      if (!reservedHeight || !rowCount || renderedHeight - reservedHeight < MIN_SHORTFALL_PX) {
        evaluatedReservations.set(entry, reservedHeight);
        continue;
      }
      corrections.push({ entry, correctedHeight: renderedHeight });
    }
    for (const { entry, correctedHeight } of corrections) {
      const reservation = `auto ${Math.round(correctedHeight)}px`;
      entry.style.setProperty("contain-intrinsic-size", reservation);
      evaluatedReservations.set(entry, Math.round(correctedHeight));
      const region = entry.querySelector(DIFF_REGION_SELECTOR);
      if (!region) {
        console.debug(LOG_PREFIX, "A diff entry has no inner region to resize", entry);
        continue;
      }
      region.style.setProperty("contain-intrinsic-size", reservation);
      console.debug(LOG_PREFIX, `Reserved ${reservation} for ${region.id}`);
    }
  }
  function readReservedHeight(entry) {
    const lengths = entry.style.getPropertyValue("contain-intrinsic-size").match(/[\d.]+(?=px)/g);
    if (!lengths) {
      return 0;
    }
    return Number.parseFloat(lengths[lengths.length - 1]);
  }
  function measureDiffRowHeight(entries) {
    if (measuredRowHeight) {
      return measuredRowHeight;
    }
    for (const entry of entries) {
      const row = entry.querySelector(DIFF_LINE_ROW_SELECTOR);
      const height = row?.getBoundingClientRect().height ?? 0;
      if (height) {
        measuredRowHeight = height;
        console.debug(LOG_PREFIX, `Calibrated the diff row height to ${height}px`);
        return measuredRowHeight;
      }
    }
    console.debug(LOG_PREFIX, "No rendered diff row to calibrate against yet; using the fallback height");
    return FALLBACK_ROW_HEIGHT_PX;
  }

  // src/content/fileTreeViewedState.ts
  var anchorsByRow = /* @__PURE__ */ new WeakMap();
  function markViewedFilesInTree() {
    const rows = document.querySelectorAll(FILE_TREE_ROW_SELECTOR);
    if (!rows.length) {
      return;
    }
    const viewedByAnchor = /* @__PURE__ */ new Map();
    for (const toggle of document.querySelectorAll(VIEWED_TOGGLE_SELECTOR)) {
      const region = toggle.closest(DIFF_REGION_SELECTOR);
      if (!region) {
        console.debug(LOG_PREFIX, "Found a viewed toggle outside any diff region", toggle);
        continue;
      }
      viewedByAnchor.set(region.id, toggle.getAttribute(VIEWED_TOGGLE_STATE_ATTRIBUTE) === "true");
    }
    for (const row of rows) {
      const anchor = getRowAnchor(row);
      const isViewed = anchor ? viewedByAnchor.get(anchor) : void 0;
      if (isViewed !== void 0) {
        applyViewedState(row, isViewed);
      }
    }
  }
  function syncViewedRowForToggle(toggle) {
    const region = toggle.closest(DIFF_REGION_SELECTOR);
    if (!region) {
      console.debug(LOG_PREFIX, "A toggled viewed button sits outside any diff region", toggle);
      return;
    }
    const row = document.querySelector(
      `${FILE_TREE_ROW_SELECTOR}:has(a[href="#${region.id}"])`
    );
    if (!row) {
      console.debug(LOG_PREFIX, "No file tree row links to", region.id);
      return;
    }
    applyViewedState(row, toggle.getAttribute(VIEWED_TOGGLE_STATE_ATTRIBUTE) === "true");
  }
  function applyViewedState(row, isViewed) {
    if (row.hasAttribute(VIEWED_TREE_ROW_MARKER) === isViewed) {
      return;
    }
    if (isViewed) {
      row.setAttribute(VIEWED_TREE_ROW_MARKER, "true");
      return;
    }
    row.removeAttribute(VIEWED_TREE_ROW_MARKER);
  }
  function getRowAnchor(row) {
    const cached = anchorsByRow.get(row);
    if (cached) {
      return cached;
    }
    const link = row.querySelector('a[href^="#diff-"]');
    const anchor = link?.getAttribute("href")?.slice(1);
    if (!anchor) {
      console.debug(LOG_PREFIX, "A file tree row has no link to a diff region", row);
      return null;
    }
    anchorsByRow.set(row, anchor);
    return anchor;
  }

  // src/content/index.ts
  var PULL_CONVERSATION_PATTERN = /^\/[^/]+\/[^/]+\/pull\/\d+\/?$/;
  var PULL_FILES_PATTERN = /^\/[^/]+\/[^/]+\/pull\/\d+\/(files|changes)\/?$/;
  var FILES_SCAN_INTERVAL_MS = 400;
  function runEnhancements() {
    const pathname = window.location.pathname;
    if (PULL_CONVERSATION_PATTERN.test(pathname)) {
      if (relocateMergePanel()) {
        hideTrailingTimelineDivider();
      }
      ensureMergeDock();
    } else {
      hideMergeDock();
    }
    if (PULL_FILES_PATTERN.test(pathname)) {
      scheduleFilesScan();
    }
  }
  var lastFilesScanAt = 0;
  var trailingFilesScan = 0;
  function scheduleFilesScan() {
    const sinceLastScan = performance.now() - lastFilesScanAt;
    if (sinceLastScan >= FILES_SCAN_INTERVAL_MS) {
      runFilesScan();
      return;
    }
    if (!trailingFilesScan) {
      trailingFilesScan = window.setTimeout(runFilesScan, FILES_SCAN_INTERVAL_MS - sinceLastScan);
    }
  }
  function runFilesScan() {
    window.clearTimeout(trailingFilesScan);
    trailingFilesScan = 0;
    lastFilesScanAt = performance.now();
    if (!PULL_FILES_PATTERN.test(window.location.pathname)) {
      return;
    }
    reserveAccurateDiffHeights();
    markViewedFilesInTree();
    renderPdfPreviews();
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
  var structureObserver = new MutationObserver(scheduleRun);
  structureObserver.observe(document.body, { childList: true, subtree: true });
  var viewedObserver = new MutationObserver((records) => {
    for (const record of records) {
      if (record.target instanceof HTMLElement && record.target.matches(VIEWED_TOGGLE_SELECTOR)) {
        syncViewedRowForToggle(record.target);
      }
    }
  });
  viewedObserver.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: [VIEWED_TOGGLE_STATE_ATTRIBUTE]
  });
  console.debug(LOG_PREFIX, "Content script initialized");
  runEnhancements();
})();
