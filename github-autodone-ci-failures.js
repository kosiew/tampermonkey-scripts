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
      console.log(
        "==> waitForUILibrary called, checking for window.TampermonkeyUI"
      );
      console.log("==> Current URL:", window.location.href);
      console.log("==> Document readyState:", document.readyState);

      if (window.TampermonkeyUI) {
        console.log("==> TampermonkeyUI found, creating UI instance");
        console.log("==> TampermonkeyUI constructor:", window.TampermonkeyUI);

        try {
          // Create UI instance from the shared library
          this.ui = new window.TampermonkeyUI(this.options);
          console.log("==> UI instance created successfully:", this.ui);
          initFn();
        } catch (error) {
          console.error("==> Error creating UI instance:", error);
        }
      } else {
        console.log("==> TampermonkeyUI not found, retrying in 50ms");
        console.log(
          "==> Available window properties:",
          Object.keys(window).filter((key) => key.includes("Tamper"))
        );
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
      console.log("==> UI instance available:", !!this.ui);

      if (!this.ui) {
        console.error("==> No UI instance available for button creation");
        return null;
      }

      try {
        const button = this.ui.addButton(options);
        console.log("==> Button created successfully:", button);
        console.log("==> Button parent element:", button?.parentElement);
        return button;
      } catch (error) {
        console.error("==> Error creating button:", error);
        return null;
      }
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
   * Extracts CI activity and icon details from a row
   * @param {HTMLElement} row - The notification row element
   * @returns {Object} An object containing CI activity and icon details
   */
  function extractRowDetails(row) {
    const failedIcon = row.querySelector("svg.octicon-x.color-fg-danger");
    const failedIconAlt = row.querySelector("svg.octicon-x");
    const anyFailedIcon = row.querySelector("svg[class*='octicon-x']");
    const xIcon = row.querySelector("svg.octicon-x-circle-fill");
    const redIcon = row.querySelector("svg.color-fg-danger");
    const stoppedIcon = row.querySelector("svg.octicon-stop");

    const label = row.querySelector(".px-2");
    const labelText = label?.textContent?.trim();
    const ciText = row.textContent.toLowerCase().includes("ci activity");
    const checkSuiteText = row.textContent.toLowerCase().includes("checksuite");
    const workflowText = row.textContent.toLowerCase().includes("workflow");

    return {
      failedIcon,
      failedIconAlt,
      anyFailedIcon,
      xIcon,
      redIcon,
      stoppedIcon,
      labelText,
      ciText,
      checkSuiteText,
      workflowText
    };
  }

  /**
   * Processes rows and clicks "Done" for matching criteria
   * @param {NodeList} rows - The list of notification rows
   * @param {Function} matchCriteria - A function to determine if a row matches the criteria
   * @returns {number} The count of processed rows
   */
  function processRows(rows, matchCriteria) {
    let processedCount = 0;

    rows.forEach((row, index) => {
      const details = extractRowDetails(row);

      if (matchCriteria(details)) {
        console.log(`==> Row ${index + 1} matches criteria, looking for done button`);

        const doneButton = row.querySelector("button.js-mark-notification-as-read") ||
          row.querySelector("button[title*='Done']") ||
          row.querySelector("button[aria-label*='Done']") ||
          row.querySelector("button[aria-label*='Mark as done']") ||
          row.querySelector("button[title*='Mark as done']");

        if (doneButton) {
          console.log(`==> Clicking done button for row ${index + 1}:`, doneButton);
          doneButton.click();
          processedCount++;
        } else {
          console.log(`==> No done button found for row ${index + 1}`);
        }
      } else {
        console.log(`==> Row ${index + 1} does not match criteria`);
      }
    });

    return processedCount;
  }

  /**
   * Auto-click "Done" for CI activity rows that show a failed status
   * @returns {number} Number of failed CI notifications processed
   */
  function clickDoneForFailedCI() {
    console.log("==> clickDoneForFailedCI function called");

    const rows = document.querySelectorAll("[data-notification-id]");
    return processRows(rows, (details) => {
      const hasFailureIcon = !!(
        details.failedIcon ||
        details.failedIconAlt ||
        details.anyFailedIcon ||
        details.xIcon ||
        details.redIcon
      );
      const isCIActivity =
        details.labelText === "ci activity" ||
        details.ciText ||
        details.checkSuiteText ||
        details.workflowText;

      return hasFailureIcon && isCIActivity;
    });
  }

  /**
   * Auto-click "Done" for CI activity rows that show a stopped status
   * @returns {number} Number of stopped CI notifications processed
   */
  function clickDoneForStoppedCI() {
    console.log("==> clickDoneForStoppedCI function called");

    const rows = document.querySelectorAll("[data-notification-id]");
    return processRows(rows, (details) => {
      const hasStoppedIcon = !!details.stoppedIcon;
      const isCIActivity =
        details.labelText === "ci activity" ||
        details.ciText ||
        details.checkSuiteText ||
        details.workflowText;

      return hasStoppedIcon && isCIActivity;
    });
  }

  /**
   * Initialize the script after UI library has loaded
   */
  async function initializeScript() {
    console.log("==> initializeScript function called");
    console.log("==> Current page URL:", window.location.href);
    console.log(
      "==> Is on notifications page:",
      window.location.href.includes("/notifications")
    );

    // Check if we're on the right page
    if (!window.location.href.includes("/notifications")) {
      console.log("==> Not on notifications page, skipping button creation");
      return;
    }

    // Check if button already exists
    const existingButton = document.getElementById(CONFIG.buttonId);
    if (existingButton) {
      console.log(
        "==> Button already exists, skipping creation. Existing button:",
        existingButton
      );
      return;
    }

    // Check if header exists
    const header = document.querySelector(".Header");
    console.log("==> Header element found:", !!header);
    if (header) {
      console.log(
        "==> Header innerHTML preview:",
        header.innerHTML.substring(0, 200) + "..."
      );
    }

    // Check UI manager state
    console.log("==> UI Manager state:", {
      hasUI: !!uiManager.getUI(),
      uiInstance: uiManager.getUI()
    });

    if (!uiManager.getUI()) {
      console.error("==> No UI instance available, cannot create button");
      return;
    }

    try {
      // Create auto-done button
      console.log("==> About to create button...");
      const autoDoneButton = uiManager.addButton({
        id: CONFIG.buttonId,
        text: "Auto-Done CI Failures",
        title: "Mark all failed CI activity notifications as done",
        className: "gh-ci-autodone-button",
        onClick: async () => {
          console.log("==> Button clicked!");

          const failedCount = clickDoneForFailedCI();
          const stoppedCount = clickDoneForStoppedCI();

          const totalProcessed = failedCount + stoppedCount;

          if (totalProcessed > 0) {
            // Visual feedback on button
            autoDoneButton.textContent = `Processed ${totalProcessed}!`;
            setTimeout(() => {
              autoDoneButton.textContent = "Auto-Done CI Failures";
            }, 3000);

            GM.notification({
              title: "GitHub CI Auto-Done",
              text: `Marked ${totalProcessed} CI notification(s) as done.`,
              timeout: 3000
            });
          } else {
            // Visual feedback for no items
            autoDoneButton.textContent = "No failures or stopped found";
            setTimeout(() => {
              autoDoneButton.textContent = "Auto-Done CI Failures";
            }, 2000);

            GM.notification({
              title: "GitHub CI Auto-Done",
              text: "No failed or stopped CI activity notifications found.",
              timeout: 3000
            });
          }
        }
      });

      if (autoDoneButton) {
        console.log(
          "==> Button created successfully with ID:",
          CONFIG.buttonId
        );
        console.log("==> Button element:", autoDoneButton);
        console.log("==> Button is in DOM:", document.contains(autoDoneButton));
        console.log(
          "==> Button visibility:",
          window.getComputedStyle(autoDoneButton).display
        );
      } else {
        console.error("==> Button creation returned null/undefined");
      }
    } catch (error) {
      console.error("==> Error in button creation process:", error);
      console.error("==> Error stack:", error.stack);
    }
  }

  // Initialize the script when the document is ready
  if (document.readyState === "loading") {
    console.log("==> Document still loading, waiting for DOMContentLoaded");
    document.addEventListener("DOMContentLoaded", () => {
      console.log("==> DOMContentLoaded fired, waiting for UI library");
      uiManager.waitForUILibrary(initializeScript);
    });
  } else {
    console.log("==> Document already loaded, waiting for UI library");
    uiManager.waitForUILibrary(initializeScript);
  }

  // Handle GitHub's Turbo navigation for single-page application behavior
  document.addEventListener("turbo:load", () => {
    console.log("==> Turbo:load event fired");
    uiManager.waitForUILibrary(initializeScript);
  });
  document.addEventListener("turbo:render", () => {
    console.log("==> Turbo:render event fired");
    uiManager.waitForUILibrary(initializeScript);
  });

  // Additional debugging for GitHub events
  document.addEventListener("pjax:end", () => {
    console.log("==> pjax:end event fired");
    uiManager.waitForUILibrary(initializeScript);
  });
})();
