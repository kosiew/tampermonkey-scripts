// ==UserScript==
// @name         GitHub Branches Bulk Delete
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Bulk delete all branches on a GitHub branches page with one click
// @author       You
// @match        https://github.com/*/branches*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @require      https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/refs/heads/main/tampermonkey-ui-library.js
// @grant        GM.notification
// ==/UserScript==

(function () {
  "use strict";

  /**
   * Checks if the current page is a GitHub branches page with pagination
   * @returns {boolean}
   */
  function isBranchesPage() {
    const isGithub = window.location.hostname === "github.com";
    const hasBranches = window.location.pathname.includes("/branches");
    const hasPage = window.location.search.includes("page=");
    console.log("[BulkDelete] isGithub:", isGithub, "hasBranches:", hasBranches, "hasPage:", hasPage);
    return isGithub && hasBranches && hasPage;
  }

  /**
   * Finds all branch rows in the branches table
   * @returns {HTMLElement[]} Array of branch row elements
   */
  function getBranchRows() {
    return Array.from(document.querySelectorAll("tr.TableRow"));
  }

  /**
   * Finds the delete button in a branch row
   * @param {HTMLElement} row - The branch row element
   * @returns {HTMLButtonElement|null} The delete button or null
   */
  function getDeleteButton(row) {
    return row.querySelector('button[aria-label*="Delete branch"], button.octicon-trash, button svg.octicon-trash')?.closest('button') || null;
  }

  /**
   * Gets the branch name from a row
   * @param {HTMLElement} row - The branch row element
   * @returns {string} The branch name
   */
  function getBranchName(row) {
    const nameDiv = row.querySelector(".font-medium, .prc-BranchName-BranchName-jFtg-");
    if (nameDiv) {
      return nameDiv.textContent.trim();
    }
    // fallback: look for a[href*='/tree/']
    const link = row.querySelector("a[href*='/tree/']");
    return link ? link.textContent.trim() : "(unknown)";
  }

  /**
   * Clicks all delete buttons for branches, with confirmation and feedback
   */
  async function deleteAllBranches() {
    const rows = getBranchRows();
    // Filter out rows with unknown branch name
    const validRows = rows.filter(row => getBranchName(row) !== "(unknown)");
    if (validRows.length === 0) {
      alert("No valid branches found on this page.");
      return;
    }
    const branchNames = validRows.map(getBranchName).join("\n");
    const confirmed = confirm(
      `Are you sure you want to delete ALL branches on this page?\n\n${branchNames}`
    );
    if (!confirmed) return;

    let deleted = 0;
    for (const row of validRows) {
      const btn = getDeleteButton(row);
      const name = getBranchName(row);
      if (btn) {
        btn.click();
        deleted++;
        // Visual feedback
        row.style.background = "#ffeaea";
        // Notify
        GM.notification({
          title: "Branch Deleted",
          text: name,
          timeout: 2000
        });
        // Wait for modal/confirmation if needed
        await new Promise((r) => setTimeout(r, 500));
        // If a modal appears, auto-confirm
        const confirmBtn = document.querySelector('button[data-testid="confirm-delete-branch-button"], button[name="verify_delete_branch"]');
        if (confirmBtn) {
          confirmBtn.click();
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
    alert(`Deleted ${deleted} branches on this page.`);
  }

  /**
   * Adds a bulk delete button to the page UI
   */
  // UIManager class for robust button injection (modeled after github-autodone-ci-failures.js)
  class UIManager {
    constructor(options = {}) {
      this.ui = null;
      this.options = {
        containerClass: "tm-scripts-container",
        containerParent: ".Header, .AppHeader, .subnav, .Subnav, .Box-header, .d-flex.flex-justify-between",
        ...options
      };
    }

    waitForUILibrary(initFn) {
      if (window.TampermonkeyUI) {
        try {
          this.ui = new window.TampermonkeyUI(this.options);
          initFn();
        } catch (error) {
          console.error("[BulkDelete] Error creating UI instance:", error);
        }
      } else {
        setTimeout(() => this.waitForUILibrary(initFn), 50);
      }
    }

    getUI() {
      return this.ui;
    }

    addButton(options) {
      if (!this.ui) {
        console.error("[BulkDelete] No UI instance available for button creation");
        return null;
      }
      try {
        return this.ui.addButton(options);
      } catch (error) {
        console.error("[BulkDelete] Error creating button:", error);
        return null;
      }
    }
  }

  // Create a global instance of the UI manager
  const uiManager = new UIManager();

  // Styles for the button
  const styles = `
    .bulk-delete-branches-btn {
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
    .bulk-delete-branches-btn:hover {
      opacity: 0.9;
      background-color: var(--color-danger-emphasis, #b31d28);
    }
  `;
  const styleSheet = document.createElement("style");
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  function addBulkDeleteButton() {
    if (document.getElementById("bulk-delete-branches-btn")) {
      console.log("[BulkDelete] Button already exists, skipping add.");
      return;
    }
    if (!uiManager.getUI()) {
      console.error("[BulkDelete] No UI instance available, cannot create button");
      return;
    }
    const button = uiManager.addButton({
      id: "bulk-delete-branches-btn",
      text: "Delete ALL Branches on Page",
      title: "Bulk delete all branches on this page",
      className: "bulk-delete-branches-btn",
      onClick: deleteAllBranches
    });
    if (button) {
      console.log("[BulkDelete] Bulk delete button added via UIManager.");
    } else {
      console.error("[BulkDelete] Button creation returned null/undefined");
    }
  }

  // Initialize when DOM is ready and on correct page
  async function initializeScript() {
    console.log("[BulkDelete] Initializing bulk delete script...");
    if (!isBranchesPage()) {
      console.log("[BulkDelete] Not a branches page, aborting init.");
      return;
    }
    addBulkDeleteButton();
  }

  // Wait for UI library and initialize
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      uiManager.waitForUILibrary(initializeScript);
    });
  } else {
    uiManager.waitForUILibrary(initializeScript);
  }

  // Re-add button on navigation (GitHub uses PJAX)
  document.addEventListener("pjax:end", () => {
    uiManager.waitForUILibrary(initializeScript);
  });
})();
