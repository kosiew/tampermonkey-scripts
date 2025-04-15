// ==UserScript==
// @name         GitHub PR CI Error Filter
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds a floating button to hide/show GitHub PRs with CI errors
// @author       You
// @match        https://github.com/*/*/pulls*
// @icon         https://github.githubassets.com/favicons/favicon.svg
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
   * Waits for the UI library to be available and initializes the script
   * @param {Function} initFn - The initialization function to call when UI is ready
   * @param {Object} config - Configuration object to pass to the initialization function
   * @param {Object} uiOptions - Options for the UI constructor
   */
  function waitForUILibrary(initFn, config, uiOptions = {}) {
    if (window.TampermonkeyUI) {
      // Create UI instance from the shared library
      const ui = new window.TampermonkeyUI({
        containerClass: "tm-scripts-container",
        containerParent: ".Header",
        ...uiOptions
      });

      initFn(ui, config);
    } else {
      // Retry after a short delay
      setTimeout(() => waitForUILibrary(initFn, config, uiOptions), 50);
    }
  }

  /**
   * Initializes the script with the UI instance
   * @param {TampermonkeyUI} ui - The UI instance
   * @param {Object} config - Configuration options for the script
   */
  function initializeScript(ui, config) {
    // Add styles for the hidden class
    const hiddenStyles = document.createElement("style");
    hiddenStyles.textContent = `.${config.hiddenClass} { display: none !important; }`;
    document.head.appendChild(hiddenStyles);

    // Check saved preference
    const shouldHide = localStorage.getItem(config.storageKey) === "true";

    // Add button
    const button = ui.addButton({
      id: config.buttonId,
      text: shouldHide ? "Show CI Errors" : "Hide CI Errors",
      title: "Toggle visibility of PRs with CI errors",
      onClick: () => toggleErrorPRs(config, ui),
      active: shouldHide
    });

    // Apply hiding if needed
    if (shouldHide) {
      const allPRs = document.querySelectorAll(config.selectors.prList);
      allPRs.forEach((pr) => {
        if (hasCIErrors(pr, config)) {
          pr.classList.add(config.hiddenClass);
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
                node.matches(config.selectors.prList)
              ) {
                if (hasCIErrors(node, config)) {
                  node.classList.add(config.hiddenClass);
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
   * @param {Object} config - Configuration options
   * @returns {boolean} True if the PR has CI errors
   */
  function hasCIErrors(prElement, config) {
    return prElement.querySelector(config.selectors.errorIndicator) !== null;
  }

  /**
   * Toggles the visibility of PRs with CI errors
   * @param {Object} config - Configuration options
   * @param {TampermonkeyUI} [ui] - The UI instance if available
   * @returns {void}
   */
  function toggleErrorPRs(config, ui) {
    try {
      const button = document.getElementById(config.buttonId);
      const isHiding = !button.classList.contains("active");

      // Update button state
      button.classList.toggle("active");
      button.textContent = isHiding ? "Show CI Errors" : "Hide CI Errors";

      // Find all PRs
      const allPRs = document.querySelectorAll(config.selectors.prList);

      let hiddenCount = 0;

      // Toggle visibility for PRs with errors
      allPRs.forEach((pr) => {
        if (hasCIErrors(pr, config)) {
          pr.classList.toggle(config.hiddenClass, isHiding);
          if (isHiding) hiddenCount++;
        }
      });

      // Save preference
      localStorage.setItem(config.storageKey, isHiding.toString());

      // Show feedback
      if (isHiding) {
        const message = `${hiddenCount} PR${
          hiddenCount !== 1 ? "s" : ""
        } with CI errors hidden`;

        // Use provided UI instance or create a new one
        const feedbackUI =
          ui ||
          new window.TampermonkeyUI({
            containerClass: "tm-scripts-container",
            containerParent: ".Header"
          });

        feedbackUI.showFeedback(message);
      }
    } catch (error) {
      console.error("Error toggling PR visibility:", error);
    }
  }

  // Start initialization by waiting for the UI library
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () =>
      waitForUILibrary(initializeScript, CONFIG)
    );
  } else {
    waitForUILibrary(initializeScript, CONFIG);
  }
})();
