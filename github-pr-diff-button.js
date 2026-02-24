// ==UserScript==
// @name         GitHub PR Diff Button
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Adds a button to view PR diff in new tab
// @author       Siew Kam Onn
// @match        https://github.com/*/pull/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @require      https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/refs/heads/main/tampermonkey-ui-library.js
// @grant        GM.openInTab
// ==/UserScript==

(function () {
  "use strict";

  /**
   * Adds a "View Diff" button inside the shared tm-scripts-container
   * supplied by the Tampermonkey UI library.  Falls back gracefully if the
   * library isn't available.
   * @returns {void}
   */
  function addDiffButton() {
    console.log("[PR Diff] addDiffButton running");
    // don't add twice
    if (document.getElementById("tm-diff-button")) return;

    // open diff helper
    function openDiff() {
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
    }

    // use shared UI container if available
    const addViaUI = () => {
      if (!window.TampermonkeyUI) {
        // try again soon
        setTimeout(addViaUI, 50);
        return;
      }
      const ui = new window.TampermonkeyUI();
      ui.addButton({
        id: "tm-diff-button",
        text: "View Diff",
        title: "Open PR diff in new tab",
        onClick: openDiff,
      });
    };

    addViaUI();
  }

  // Handle dynamic page updates
  const observer = new MutationObserver((mutations) => {
    addDiffButton();
  });

  // Initial setup
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Run on page load
  window.addEventListener("load", addDiffButton);

  // Run immediately in case the page is already loaded
  addDiffButton();
})();
