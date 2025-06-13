// ==UserScript==
// @name         GitHub CI Activity Auto-Done for Failures
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Auto-click "Done" for CI activity rows that show a failed status in GitHub Notifications page.
// @author       You
// @match        https://github.com/notifications*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @require      https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/refs/heads/main/tampermonkey-ui-library.js
// @grant        GM.notification
// ==/UserScript==

(function () {
  "use strict";

  console.log("==> GitHub CI Auto-Done script started");

  const CONFIG = {
    buttonId: "gh-ci-autodone-button"
  };

  /**
   * Class for managing the TampermonkeyUI instance
   */
  class UIManager {
    constructor(options = {}) {
      console.log("==> UIManager constructor called");
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
      console.log("==> waitForUILibrary called, checking for window.TampermonkeyUI");
      if (window.TampermonkeyUI) {
        console.log("==> TampermonkeyUI found, creating UI instance");
        // Create UI instance from the shared library
        this.ui = new window.TampermonkeyUI(this.options);
        initFn();
      } else {
        console.log("==> TampermonkeyUI not found, retrying in 50ms");
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
      console.log("==> Attempting to add button with options:", options);
      const button = this.ui.addButton(options);
      console.log("==> Button created:", button);
      return button;
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

  // Styles for the button
  const styles = `
    .gh-ci-autodone-button {
      padding: 8px 16px;
      font-size: 14px;
      border-radius: 6px;
      border: 1px solid rgba(27, 31, 36, 0.15);
      background-color: var(--color-danger-fg, #d73a49);
      color: var(--color-fg-on-emphasis, #fff);
      cursor: pointer;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      transition: all 0.2s;
    }

    .gh-ci-autodone-button:hover {
      opacity: 0.9;
      background-color: var(--color-danger-emphasis, #b31d28);
    }
  `;

  // Add styles to page
  const styleSheet = document.createElement("style");
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  /**
   * Auto-click "Done" for CI activity rows that show a failed status
   * @returns {number} Number of failed CI notifications processed
   */
  function clickDoneForFailedCI() {
  /**
   * Auto-click "Done" for CI activity rows that show a failed status
   * @returns {number} Number of failed CI notifications processed
   */
  function clickDoneForFailedCI() {
    // Select all notification rows
    const rows = document.querySelectorAll(
      'div[data-hydro-click*="CheckSuite"]'
    );

    let processedCount = 0;

    rows.forEach((row) => {
      // Check if the red "X" (octicon-x) exists inside the row (failed CI)
      const failedIcon = row.querySelector("svg.octicon-x.color-fg-danger");
      const label = row.querySelector(".px-2");

      if (failedIcon && label?.textContent?.trim() === "ci activity") {
        // Find and click the "Done" (✓) button
        const doneButton = row.querySelector(
          "button.js-mark-notification-as-read"
        );
        if (doneButton) {
          console.log("Marking CI failed row as Done:", row);
          doneButton.click();
          processedCount++;
        }
      }
    });

    return processedCount;
  }

  /**
   * Initialize the script after UI library has loaded
   */
  async function initializeScript() {
    console.log("==> initializeScript function called");

    // Check if button already exists
    if (document.getElementById(CONFIG.buttonId)) {
      console.log("==> Button already exists, skipping creation");
      return;
    }

    // Create auto-done button
    const autoDoneButton = uiManager.addButton({
      id: CONFIG.buttonId,
      text: "Auto-Done CI Failures",
      title: "Mark all failed CI activity notifications as done",
      className: "gh-ci-autodone-button",
      onClick: async () => {
        const processedCount = clickDoneForFailedCI();

        if (processedCount > 0) {
          // Visual feedback on button
          autoDoneButton.textContent = `Processed ${processedCount}!`;
          setTimeout(() => {
            autoDoneButton.textContent = "Auto-Done CI Failures";
          }, 3000);

          GM.notification({
            title: "GitHub CI Auto-Done",
            text: `Marked ${processedCount} failed CI notification(s) as done.`,
            timeout: 3000
          });
        } else {
          // Visual feedback for no items
          autoDoneButton.textContent = "No failures found";
          setTimeout(() => {
            autoDoneButton.textContent = "Auto-Done CI Failures";
          }, 2000);

          GM.notification({
            title: "GitHub CI Auto-Done",
            text: "No failed CI activity notifications found.",
            timeout: 3000
          });
        }
      }
    });

    console.log(
      "==> Button created with ID:",
      CONFIG.buttonId,
      "Element:",
      autoDoneButton
    );
  }

  // Initialize the script when the document is ready
  if (document.readyState === "loading") {
    console.log("==> Document still loading, waiting for DOMContentLoaded");
    document.addEventListener("DOMContentLoaded", () =>
      uiManager.waitForUILibrary(initializeScript)
    );
  } else {
    console.log("==> Document already loaded, waiting for UI library");
    uiManager.waitForUILibrary(initializeScript);
  }

  // Handle GitHub's Turbo navigation for single-page application behavior
  document.addEventListener("turbo:load", () =>
    uiManager.waitForUILibrary(initializeScript)
  );
  document.addEventListener("turbo:render", () =>
    uiManager.waitForUILibrary(initializeScript)
  );

  // Run on load and after small delay in case GitHub is still rendering (original functionality)
  setTimeout(clickDoneForFailedCI, 2000);
})();
