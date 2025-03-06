// ==UserScript==
// @name         GitHub PR Diff Button
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds a button to view PR diff in new tab
// @author       Siew Kam Onn
// @match        https://github.com/*/pull/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @grant        GM.openInTab
// ==/UserScript==

(function () {
  "use strict";

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
      const currentUrl = window.location.href;
      GM.openInTab(`${currentUrl}.diff`, true);
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
})();
