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
    // Find the Code button
    const codeButton = document.querySelector(
      "get-repo details summary span.Button-content span.Button-label"
    );
    if (!codeButton || codeButton.textContent !== "Code") return;

    // Get the container (details element's parent)
    const container = codeButton.closest("get-repo").parentElement;
    if (!container) return;

    // Check if our button already exists
    if (container.querySelector(".diff-view-button")) return;

    // Create new button
    const diffButton = document.createElement("button");
    diffButton.className = "btn btn-sm diff-view-button ml-2";
    diffButton.innerHTML = "View Diff";
    diffButton.onclick = () => {
      try {
        const currentUrl = window.location.href;
        // Extract the base PR URL (remove hash fragments and extra paths after the PR number)
        const match = currentUrl
          .split("#")[0]
          .match(/https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/);
        const basePrUrl = match ? match[0] : currentUrl;
        GM.openInTab(`${basePrUrl}.diff`, true);
      } catch (error) {
        console.error("GitHub PR Diff Button: Error opening diff view", error);
        // Fall back to current URL if parsing fails
        GM.openInTab(`${window.location.href}.diff`, true);
      }
    };

    // Insert after the details element
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
