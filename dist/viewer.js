"use strict";
(() => {
  // src/constants.ts
  var LOG_PREFIX = "[GitHub PR Enhancer]";
  var ALLOWED_PDF_HOST_PATTERN = /(^|\.)github\.com$|(^|\.)githubusercontent\.com$/;

  // src/viewer/index.ts
  async function renderPdf() {
    const message = document.getElementById("message");
    const fileUrl = new URLSearchParams(window.location.search).get("file");
    if (!fileUrl) {
      console.debug(LOG_PREFIX, 'Viewer opened without a "file" parameter');
      showMessage(message, "No PDF file was provided.");
      return;
    }
    const parsedUrl = parseAllowedUrl(fileUrl);
    if (!parsedUrl) {
      console.debug(LOG_PREFIX, "Viewer refused a disallowed file URL", fileUrl);
      showMessage(message, "This PDF is hosted somewhere the preview does not trust.");
      return;
    }
    try {
      const response = await fetch(parsedUrl.toString(), { credentials: "include" });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const sourceBlob = await response.blob();
      const pdfBlob = sourceBlob.type === "application/pdf" ? sourceBlob : new Blob([sourceBlob], { type: "application/pdf" });
      window.location.replace(URL.createObjectURL(pdfBlob));
    } catch (error) {
      console.debug(LOG_PREFIX, "Failed to load PDF in viewer", fileUrl, error);
      showMessage(message, 'Could not load this PDF. Open it with the "View file" menu instead.');
    }
  }
  function parseAllowedUrl(fileUrl) {
    try {
      const parsedUrl = new URL(fileUrl);
      if (parsedUrl.protocol !== "https:" || !ALLOWED_PDF_HOST_PATTERN.test(parsedUrl.hostname)) {
        return null;
      }
      return parsedUrl;
    } catch (error) {
      console.debug(LOG_PREFIX, "Viewer received an unparseable file URL", fileUrl, error);
      return null;
    }
  }
  function showMessage(element, text) {
    if (!element) {
      console.debug(LOG_PREFIX, "Viewer message element is missing", text);
      return;
    }
    element.textContent = text;
  }
  renderPdf();
})();
