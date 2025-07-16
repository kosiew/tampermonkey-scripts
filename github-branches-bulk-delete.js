// ==UserScript==
// @name         GitHub Branches Bulk Delete
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Bulk delete all branches on a GitHub branches page with one click
// @author       You
// @match        https://github.com/*/branches*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @grant        GM.notification
// ==/UserScript==

(function () {
  "use strict";

  /**
   * Checks if the current page is a GitHub branches page with pagination
   * @returns {boolean}
   */
  function isBranchesPage() {
    return (
      window.location.hostname === "github.com" &&
      window.location.pathname.includes("/branches") &&
      window.location.search.includes("page=")
    );
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
    if (rows.length === 0) {
      alert("No branches found on this page.");
      return;
    }
    const branchNames = rows.map(getBranchName).join("\n");
    const confirmed = confirm(
      `Are you sure you want to delete ALL branches on this page?\n\n${branchNames}`
    );
    if (!confirmed) return;

    let deleted = 0;
    for (const row of rows) {
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
  function addBulkDeleteButton() {
    if (document.getElementById("bulk-delete-branches-btn")) return;
    const container = document.querySelector(".subnav, .Subnav, .d-flex.flex-justify-between, .Box-header");
    if (!container) return;
    const btn = document.createElement("button");
    btn.id = "bulk-delete-branches-btn";
    btn.textContent = "Delete ALL Branches on Page";
    btn.style = "margin-left: 1em; background: #d73a49; color: #fff; border: none; border-radius: 6px; padding: 8px 16px; font-weight: bold; cursor: pointer;";
    btn.onclick = deleteAllBranches;
    container.appendChild(btn);
  }

  // Initialize when DOM is ready and on correct page
  function initialize() {
    if (!isBranchesPage()) return;
    addBulkDeleteButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }

  // Re-add button on navigation (GitHub uses PJAX)
  document.addEventListener("pjax:end", initialize);
})();
