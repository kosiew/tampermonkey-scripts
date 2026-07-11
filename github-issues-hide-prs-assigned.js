// ==UserScript==
// @name         GitHub Issues Hide Assigned/Has-PR
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds a button to hide GitHub issues that already have a PR or are assigned
// @author       You
// @match        https://github.com/*/*/issues*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @require      https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/refs/heads/main/tampermonkey-ui-library.js
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
    buttonId: "tm-hide-filtered-issues-button",
    hiddenClass: "tm-hidden-filtered-issue",
    storageKey: "github-issues-hide-filtered",
    buttonText: {
      show: "Show Assigned/PR",
      hide: "Hide Assigned/PR",
    },
    selectors: {
      issueRow: ".js-issue-row",
      issueListContainer: ".js-navigation-container",
      pullRequestLink: 'a[data-component="Link"][href*="/pull/"], a[href*="/pull/"]',
      assigneeAvatar:
        'img[data-component="Avatar"][src*="avatars.githubusercontent.com"], img.avatar[src*="avatars.githubusercontent.com"]',
    },
  };

  /**
   * Class for managing the Tampermonkey UI instance.
   */
  class UIManager {
    constructor(options = {}) {
      this.ui = null;
      this.options = {
        containerClass: "tm-scripts-container",
        containerParent: ".Header",
        ...options,
      };
    }

    /**
     * Waits for the shared UI library before running the initializer.
     * @param {Function} initFn The callback to run once the UI library is ready.
     * @returns {void}
     */
    waitForUILibrary(initFn) {
      if (window.TampermonkeyUI) {
        this.ui = new window.TampermonkeyUI(this.options);
        initFn();
        return;
      }

      setTimeout(() => this.waitForUILibrary(initFn), 50);
    }

    /**
     * Adds a button using the shared UI container.
     * @param {Object} options The button options.
     * @returns {HTMLElement}
     */
    addButton(options) {
      return this.ui.addButton(options);
    }

    /**
     * Shows a temporary feedback message.
     * @param {string} message The message to display.
     * @returns {void}
     */
    showFeedback(message) {
      this.ui.showFeedback(message);
    }
  }

  const uiManager = new UIManager();
  let listObserver = null;

  /**
   * Checks whether the current page is a repository issues list.
   * @returns {boolean}
   */
  function isIssuesListPage() {
    return /https:\/\/github\.com\/[^/]+\/[^/]+\/issues(?:\?.*)?(?:#.*)?$/.test(
      window.location.href,
    );
  }

  /**
   * Injects the CSS used to hide filtered issues.
   * @returns {void}
   */
  function addHiddenStyles() {
    if (document.getElementById("tm-hidden-filtered-issue-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "tm-hidden-filtered-issue-styles";
    style.textContent = `.${CONFIG.hiddenClass} { display: none !important; }`;
    document.head.appendChild(style);
  }

  /**
   * Finds issue rows in the current list.
   * @returns {HTMLElement[]}
   */
  function getIssueRows() {
    return Array.from(document.querySelectorAll(CONFIG.selectors.issueRow));
  }

  /**
   * Checks whether the issue row already links to a PR.
   * @param {HTMLElement} issueElement The issue row.
   * @returns {boolean}
   */
  function hasPullRequest(issueElement) {
    return issueElement.querySelector(CONFIG.selectors.pullRequestLink) !== null;
  }

  /**
   * Checks whether the issue row shows at least one assignee avatar.
   * @param {HTMLElement} issueElement The issue row.
   * @returns {boolean}
   */
  function hasAssignee(issueElement) {
    return issueElement.querySelector(CONFIG.selectors.assigneeAvatar) !== null;
  }

  /**
   * Determines whether an issue should be hidden.
   * @param {HTMLElement} issueElement The issue row.
   * @returns {boolean}
   */
  function shouldHideIssue(issueElement) {
    return hasPullRequest(issueElement) || hasAssignee(issueElement);
  }

  /**
   * Applies or removes the hidden class across all visible issue rows.
   * @param {boolean} shouldHide Whether matching issues should be hidden.
   * @returns {{hiddenCount: number, totalCount: number}}
   */
  function applyIssueVisibility(shouldHide) {
    const issueRows = getIssueRows();
    let hiddenCount = 0;

    issueRows.forEach((issueRow) => {
      const matches = shouldHideIssue(issueRow);
      if (shouldHide && matches) {
        issueRow.classList.add(CONFIG.hiddenClass);
        hiddenCount += 1;
      } else {
        issueRow.classList.remove(CONFIG.hiddenClass);
      }
    });

    return {
      hiddenCount,
      totalCount: issueRows.length,
    };
  }

  /**
   * Updates button label and active state.
   * @param {HTMLButtonElement} button The filter button.
   * @param {boolean} shouldHide Whether the filter is enabled.
   * @returns {void}
   */
  function syncButtonState(button, shouldHide) {
    button.textContent = shouldHide
      ? CONFIG.buttonText.show
      : CONFIG.buttonText.hide;
    button.classList.toggle("active", shouldHide);
  }

  /**
   * Hooks a mutation observer so new issue rows get filtered too.
   * @param {HTMLButtonElement} button The filter button.
   * @returns {void}
   */
  function observeIssueList(button) {
    const listContainer = document.querySelector(CONFIG.selectors.issueListContainer);
    if (!listContainer) {
      return;
    }

    if (listObserver) {
      listObserver.disconnect();
    }

    listObserver = new MutationObserver((mutations) => {
      const shouldHide = button.classList.contains("active");
      if (!shouldHide) {
        return;
      }

      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
          }

          if (node.matches?.(CONFIG.selectors.issueRow) && shouldHideIssue(node)) {
            node.classList.add(CONFIG.hiddenClass);
          }

          node
            .querySelectorAll?.(CONFIG.selectors.issueRow)
            .forEach((issueRow) => {
              if (shouldHideIssue(issueRow)) {
                issueRow.classList.add(CONFIG.hiddenClass);
              }
            });
        });
      }
    });

    listObserver.observe(listContainer, { childList: true, subtree: true });
  }

  /**
   * Initializes the page button and filtering behavior.
   * @returns {void}
   */
  function initializeScript() {
    if (!isIssuesListPage()) {
      return;
    }

    if (document.getElementById(CONFIG.buttonId)) {
      return;
    }

    addHiddenStyles();

    const shouldHide = localStorage.getItem(CONFIG.storageKey) === "true";
    const button = uiManager.addButton({
      id: CONFIG.buttonId,
      text: shouldHide ? CONFIG.buttonText.show : CONFIG.buttonText.hide,
      title: "Toggle visibility of issues that already have a PR or an assignee",
      active: shouldHide,
      onClick: () => {
        const nextShouldHide = !button.classList.contains("active");
        localStorage.setItem(CONFIG.storageKey, String(nextShouldHide));
        syncButtonState(button, nextShouldHide);

        const result = applyIssueVisibility(nextShouldHide);
        const action = nextShouldHide ? "Hidden" : "Showing";
        uiManager.showFeedback(
          `${action} ${result.hiddenCount} of ${result.totalCount} issues`,
        );
      },
    });

    syncButtonState(button, shouldHide);
    applyIssueVisibility(shouldHide);
    observeIssueList(button);
  }

  uiManager.waitForUILibrary(initializeScript);
  document.addEventListener("pjax:end", initializeScript);
})();