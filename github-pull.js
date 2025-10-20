// ==UserScript==
// @name         GitHub PR successful checks monitor
// @namespace    https://github.com/kosiew/tampermonkey-scripts
// @version      0.2
// @description  Watch GitHub PR pages and notify when the Discussion paragraph shows "N successful checks"
// @author       auto-generated
// @match        https://github.com/*/*/pull/*
// @require      https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/refs/heads/main/tampermonkey-ui-library.js
// @grant        GM_notification
// @grant        GM.notification
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // Configuration
  const CONFIG = {
    buttonId: "gh-git-fetch-commands-button",
    branchSelector:
      "#partial-discussion-header > div.non-sticky-header-container > div.d-flex.flex-items-center.flex-wrap.mt-0.gh-header-meta > div.flex-auto.min-width-0.mb-2 > span.commit-ref.css-truncate.user-select-contain.expandable.head-ref > a",
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
        ...options,
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
     * Adds a button using the UI instance
     * @param {Object} options - Button configuration options
     * @returns {HTMLElement} The created button
     */
    addButton(options) {
      return this.ui.addButton(options);
    }
  }

  // Create a global instance of the UI manager
  const uiManager = new UIManager();

  // Styles for the button
  const styles = `
    .gh-git-fetch-commands-button {
      padding: 8px 16px;
      font-size: 14px;
      border-radius: 6px;
      border: 1px solid rgba(27, 31, 36, 0.15);
      background-color: var(--color-accent-fg, #1f6feb);
      color: var(--color-fg-on-emphasis, #fff);
      cursor: pointer;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      transition: opacity 0.2s;
    }
    
    .gh-git-fetch-commands-button:hover {
      opacity: 0.9;
    }
  `;

  // Add styles to page
  const styleSheet = document.createElement("style");
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  const selector = "#discussion_bucket p";
  const regex = /^\s*(\d+)\s+successful checks\s*$/i;

  let lastNotified = null;
  let completed = false;
  let startedNotified = false;
  let mainObserver = null;
  let bodyObserver = null;

  // parse PR number from URL
  const prMatch = location.pathname.match(/\/pull\/(\d+)/);
  const prNumber = prMatch ? prMatch[1] : "unknown";

  /**
   * Copy text to clipboard
   * @param {string} text - Text to copy
   * @returns {Promise<boolean>} Success status
   */
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error("Failed to copy text to clipboard:", err);

      // Fallback method for older browsers
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed"; // Prevent scrolling to bottom
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const successful = document.execCommand("copy");
        document.body.removeChild(textarea);
        return successful;
      } catch (fallbackError) {
        console.error("Fallback clipboard copy failed:", fallbackError);
        return false;
      }
    }
  }

  /**
   * Extract branch information from the PR page
   * @returns {Object|null} Object containing username and branch name, or null if not found
   */
  function extractBranchInfo() {
    const branchElement = document.querySelector(CONFIG.branchSelector);
    if (!branchElement) {
      console.error("Branch element not found");
      return null;
    }

    const href = branchElement.getAttribute("href");
    if (!href) {
      console.error("Branch href not found");
      return null;
    }

    // Extract username and branch from href
    // Example href: "/Jefffrey/datafusion/tree/acc_args_input_fields"
    const match = href.match(/\/([^\/]+)\/([^\/]+)\/tree\/(.+)/);
    if (!match) {
      console.error("Could not parse branch information from href:", href);
      return null;
    }

    const username = match[1];
    const repo = match[2];
    const branchName = match[3];

    return { username, repo, branchName };
  }

  /**
   * Generate git fetch commands
   * @param {string} prNumber - PR number
   * @param {string} issueNumber - Issue number
   * @param {Object} branchInfo - Branch information object
   * @returns {Array<string>} Array of git commands
   */
  function generateGitCommands(prNumber, issueNumber, branchInfo) {
    const { username, repo, branchName } = branchInfo;

    return [
      `g co -b pr-${prNumber}_${issueNumber}`,
      `g co ${username}/${branchName}`,
      `g f ${username} ${branchName}`,
      `g remote add ${username} git@github.com:${username}/${repo}.git`,
    ];
  }

  /**
   * Copy commands to clipboard sequentially
   * @param {Array<string>} commands - Array of commands to copy
   */
  async function copyCommandsSequentially(commands) {
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      const success = await copyToClipboard(command);

      if (!success) {
        notifyMessage("Error", `Failed to copy command ${i + 1} to clipboard`);
        return false;
      }

      // Brief pause between copies to ensure clipboard updates
      if (i < commands.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    return true;
  }

  /**
   * Handle git fetch commands button click
   */
  async function handleGitFetchCommands(button) {
    const buttonText = button.textContent;

    // Extract branch information
    const branchInfo = extractBranchInfo();
    if (!branchInfo) {
      notifyMessage("Error", "Could not find branch information on this page");
      return;
    }

    // Ask user for issue number
    const issueNumber = prompt("Enter the issue number closed by this PR:");
    if (!issueNumber) {
      notifyMessage("Cancelled", "Git fetch commands generation cancelled");
      return;
    }

    // Generate commands
    const commands = generateGitCommands(prNumber, issueNumber, branchInfo);

    // Copy last command to clipboard (so it's ready to paste)
    const lastCommand = commands[commands.length - 1];
    const success = await copyToClipboard(lastCommand);

    if (success) {
      // Visual feedback on button
      button.textContent = "Copied!";
      setTimeout(() => {
        button.textContent = buttonText;
      }, 2000);

      // Show all commands in notification
      const commandsList = commands
        .map((cmd, i) => `${i + 1}. ${cmd}`)
        .join("\n");
      notifyMessage(
        "Git Fetch Commands Ready",
        `Last command copied to clipboard. All commands:\n\n${commandsList}`
      );
    } else {
      notifyMessage("Error", "Failed to copy commands to clipboard");
    }
  }

  /**
   * Initialize the git fetch commands button
   */
  function initializeGitFetchButton() {
    // Check if button already exists
    if (document.getElementById(CONFIG.buttonId)) {
      return;
    }

    // Create git fetch commands button
    const gitFetchButton = uiManager.addButton({
      id: CONFIG.buttonId,
      text: "Git Fetch Commands",
      title: "Copy git fetch commands to clipboard",
      className: "gh-git-fetch-commands-button",
      onClick: () => handleGitFetchCommands(gitFetchButton),
    });
  }

  /**
   * Send notification message
   * @param {string} title - Notification title
   * @param {string} body - Notification body text
   */
  function notifyMessage(title, body) {
    try {
      if (typeof GM_notification === "function") {
        GM_notification({ title, text: body, timeout: 5000 });
      } else if (
        typeof GM !== "undefined" &&
        typeof GM.notification === "function"
      ) {
        GM.notification({ title, text: body, timeout: 5000 });
      } else if (window.Notification && Notification.permission === "granted") {
        new Notification(title, { body });
      } else if (window.Notification && Notification.permission !== "denied") {
        Notification.requestPermission().then((p) => {
          if (p === "granted") new Notification(title, { body });
        });
      } else {
        console.log(`[github-pull] ${title} - ${body}`);
      }
    } catch (e) {
      console.error("github-pull: notifyMessage error", e);
    }
  }

  function checkNode(node) {
    try {
      const text = node.textContent || "";
      const m = text.match(regex);
      if (m) {
        const count = m[1];
        if (lastNotified !== text) {
          lastNotified = text;
          const title = `PR ${prNumber} ${count} successful checks`;
          const body = text.trim();
          // completion notification
          notifyMessage(title, body);
          completed = true;
          // stop observers
          try {
            if (mainObserver && typeof mainObserver.disconnect === "function")
              mainObserver.disconnect();
            if (bodyObserver && typeof bodyObserver.disconnect === "function")
              bodyObserver.disconnect();
          } catch (e) {
            console.warn("github-pull: error disconnecting observers", e);
          }
        }
        return true;
      }
    } catch (e) {
      console.error("github-pull: checkNode error", e);
    }
    return false;
  }

  function scanOnce() {
    const el = document.querySelector(selector);
    if (el) checkNode(el);
  }

  // observe changes under discussion_bucket
  const container = document.querySelector("#discussion_bucket");
  function startObserving(containerEl) {
    if (startedNotified) return;
    startedNotified = true;
    notifyMessage("Started monitoring PR " + prNumber + " checks", "");
    // scan once right away
    scanOnce();
    mainObserver = new MutationObserver((mutations) => {
      if (completed) return;
      for (const mu of mutations) {
        for (const node of mu.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches && node.matches("p")) {
              checkNode(node);
            } else {
              const p = node.querySelector && node.querySelector("p");
              if (p) checkNode(p);
            }
          }
        }
        if (
          mu.type === "characterData" &&
          mu.target &&
          mu.target.parentElement
        ) {
          const p =
            mu.target.parentElement.closest &&
            mu.target.parentElement.closest("p");
          if (p) checkNode(p);
        }
      }
    });
    mainObserver.observe(containerEl, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  if (container) {
    startObserving(container);
  } else {
    // if container not yet present, watch body for it
    bodyObserver = new MutationObserver(() => {
      const c = document.querySelector("#discussion_bucket");
      if (c) {
        if (bodyObserver && typeof bodyObserver.disconnect === "function")
          bodyObserver.disconnect();
        startObserving(c);
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Initialize git fetch commands button
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () =>
      uiManager.waitForUILibrary(initializeGitFetchButton)
    );
  } else {
    uiManager.waitForUILibrary(initializeGitFetchButton);
  }

  // Handle GitHub's Turbo navigation for single-page application behavior
  document.addEventListener("turbo:load", () => {
    uiManager.waitForUILibrary(initializeGitFetchButton);
  });
  document.addEventListener("turbo:render", () => {
    uiManager.waitForUILibrary(initializeGitFetchButton);
  });
})();
