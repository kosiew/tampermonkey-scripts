// ==UserScript==
// @name         GitHub PR CI Error Filter
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds a floating button to hide/show GitHub PRs with CI errors
// @author       You
// @match        https://github.com/*/*/pulls*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @require      https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/refs/heads/main/tampermonkey-ui-library.js
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  /**
   * Configuration variables
   */
  const CONFIG = {
    buttonId: "tm-hide-ci-errors-button",
    hiddenClass: "tm-hidden-pr",
    storageKey: "github-pr-hide-ci-errors",
    selectors: {
      prList: ".js-issue-row",
      errorIndicator: ".octicon-x"
    }
  };

  /**
   * Class for managing the TampermonkeyUI instance
   */
  class UIManager {
    constructor(options = {}) {
      this.ui = null;
      this.options = {
        containerClass: "tm-scripts-container",
        containerParent: ".Header",
        ...options
      };
    }

    /**
     * Initializes the UI manager by waiting for UI library to be available
     * @param {Function} initFn - The initialization function to call when UI is ready
     */
    waitForUILibrary(initFn) {
      if (window.TampermonkeyUI) {
        // Create UI instance from the shared library
        this.ui = new window.TampermonkeyUI(this.options);
        initFn();
      } else {
        // Retry after a short delay
        setTimeout(() => this.waitForUILibrary(initFn), 50);
      }
    }

    /**
     * Gets the UI instance
     * @returns {TampermonkeyUI|null} The UI instance
     */
    getUI() {
      return this.ui;
    }

    /**
     * Adds a button using the UI instance
     * @param {Object} options - Button configuration options
     * @returns {HTMLElement} The created button
     */
    addButton(options) {
      return this.ui.addButton(options);
    }

    /**
     * Shows feedback using the UI instance
     * @param {string} message - The message to display
     */
    showFeedback(message) {
      this.ui.showFeedback(message);
    }
  }

  // Create a global instance of the UI manager
  const uiManager = new UIManager();

  /**
   * Initializes the script
   */
  function initializeScript() {
    // Add styles for the hidden class
    const hiddenStyles = document.createElement("style");
    hiddenStyles.textContent = `.${CONFIG.hiddenClass} { display: none !important; }`;
    document.head.appendChild(hiddenStyles);

    // Check saved preference
    const shouldHide = localStorage.getItem(CONFIG.storageKey) === "true";

    // Add button
    const button = uiManager.addButton({
      id: CONFIG.buttonId,
      text: shouldHide ? "Show CI Errors" : "Hide CI Errors",
      title: "Toggle visibility of PRs with CI errors",
      onClick: toggleErrorPRs,
      active: shouldHide
    });

    // Apply hiding if needed
    if (shouldHide) {
      const allPRs = document.querySelectorAll(CONFIG.selectors.prList);
      allPRs.forEach((pr) => {
        if (hasCIErrors(pr)) {
          pr.classList.add(CONFIG.hiddenClass);
        }
      });
    }

    // For dynamic content loading, we can use a MutationObserver
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          // Check if PRs should be hidden and apply hiding
          if (button.classList.contains("active")) {
            mutation.addedNodes.forEach((node) => {
              if (
                node.nodeType === 1 &&
                node.matches(CONFIG.selectors.prList)
              ) {
                if (hasCIErrors(node)) {
                  node.classList.add(CONFIG.hiddenClass);
                }
              }
            });
          }
        }
      }
    });

    // Start observing
    const prListContainer = document.querySelector(
      ".js-active-navigation-container"
    );
    if (prListContainer) {
      observer.observe(prListContainer, { childList: true, subtree: true });
    }
  }

  /**
   * Checks if a PR has CI errors
   * @param {HTMLElement} prElement - The PR element to check
   * @returns {boolean} True if the PR has CI errors
   */
  function hasCIErrors(prElement) {
    return prElement.querySelector(CONFIG.selectors.errorIndicator) !== null;
  }

  /**
   * Toggles the visibility of PRs with CI errors
   * @returns {void}
   */
  function toggleErrorPRs() {
    try {
      const button = document.getElementById(CONFIG.buttonId);
      const isHiding = !button.classList.contains("active");

      // Update button state
      button.classList.toggle("active");
      button.textContent = isHiding ? "Show CI Errors" : "Hide CI Errors";

      // Find all PRs
      const allPRs = document.querySelectorAll(CONFIG.selectors.prList);

      let hiddenCount = 0;

      // Toggle visibility for PRs with errors
      allPRs.forEach((pr) => {
        if (hasCIErrors(pr)) {
          pr.classList.toggle(CONFIG.hiddenClass, isHiding);
          if (isHiding) hiddenCount++;
        }
      });

      // Save preference
      localStorage.setItem(CONFIG.storageKey, isHiding.toString());

      // Show feedback
      if (isHiding) {
        const message = `${hiddenCount} PR${
          hiddenCount !== 1 ? "s" : ""
        } with CI errors hidden`;

        uiManager.showFeedback(message);
      }
    } catch (error) {
      console.error("Error toggling PR visibility:", error);
    }
  }

  // Start initialization by waiting for the UI library
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () =>
      uiManager.waitForUILibrary(initializeScript)
    );
  } else {
    uiManager.waitForUILibrary(initializeScript);
  }
})();
