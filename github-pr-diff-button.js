// ==UserScript==
// @name         GitHub PR Diff Button
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Adds a button to view PR diff in new tab
// @author       Siew Kam Onn
// @match        https://github.com/*/pull/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @grant        GM.openInTab
// ==/UserScript==

(function () {
  "use strict";

  /**
   * Adds a "View Diff" button next to the Code button in GitHub PR pages
   * @returns {void}
   */
  function addDiffButton() {
    // avoid adding the button twice
    if (document.querySelector(".diff-view-button")) return;

    // helper to build the button
    const createButton = () => {
      const b = document.createElement("button");
      b.className = "btn btn-sm diff-view-button ml-2";
      b.textContent = "View Diff";
      b.onclick = () => {
        try {
          const currentUrl = window.location.href;
          const match = currentUrl
            .split("#")[0]
            .match(/https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/);
          const basePrUrl = match ? match[0] : currentUrl;
          GM.openInTab(`${basePrUrl}.diff`, true);
        } catch (error) {
          console.error("GitHub PR Diff Button: Error opening diff view", error);
          GM.openInTab(`${window.location.href}.diff`, true);
        }
      };
      return b;
    };

    // try to locate the repository "Code" clone/dropdown button
    let container = null;
    const codeButton = document.querySelector(
      "get-repo details summary span.Button-content span.Button-label"
    );
    if (codeButton && codeButton.textContent === "Code") {
      container = codeButton.closest("get-repo")?.parentElement || null;
    }

    // if we didn't find it (e.g. on PR pages the clone box isn't shown),
    // fall back to adding the button near the PR header/title area
    if (!container) {
      // GitHub uses `.gh-header-actions` for the action buttons on PRs
      container = document.querySelector(".gh-header-actions");
      if (!container) {
        // last resort: put it next to the title
        const title = document.querySelector(".js-issue-title");
        container = title ? title.parentElement : null;
      }
    }

    if (!container) return;

    const diffButton = createButton();
    container.appendChild(diffButton);
  }

  // Handle dynamic page updates
  const observer = new MutationObserver((mutations) => {
    addDiffButton();
  });

  // Initial setup
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Run on page load
  window.addEventListener("load", addDiffButton);

  // Run immediately in case the page is already loaded
  addDiffButton();
})();
