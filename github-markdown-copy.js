// ==UserScript==
// @name         GitHub Markdown Copy
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds a button to copy markdown content from GitHub pages
// @author       Siew Kam Onn
// @match        https://github.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @require      https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/refs/heads/main/tampermonkey-ui-library.js
// @grant        GM.notification
// ==/UserScript==

(function () {
  "use strict";

  console.log(" ==> GitHub Markdown Copy script started");

  const CONFIG = {
    buttonId: "gh-markdown-copy-button"
  };

  /**
   * Class for managing the TampermonkeyUI instance
   */
  class UIManager {
    constructor(options = {}) {
      console.log(" ==> UIManager constructor called");
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
        " ==> waitForUILibrary called, checking for window.TampermonkeyUI"
      );
      if (window.TampermonkeyUI) {
        console.log(" ==> TampermonkeyUI found, creating UI instance");
        // Create UI instance from the shared library
        this.ui = new window.TampermonkeyUI(this.options);
        initFn();
      } else {
        console.log(" ==> TampermonkeyUI not found, retrying in 50ms");
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
      console.log(" ==> Attempting to add button with options:", options);
      const button = this.ui.addButton(options);
      console.log(" ==> Button created:", button);
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

  // Styles for the floating button
  const styles = `
    .gh-markdown-copy-button {
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
    
    .gh-markdown-copy-button:hover {
      opacity: 0.9;
    }
  `;

  // Add styles to page
  const styleSheet = document.createElement("style");
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  /**
   * Extracts markdown content from elements with data-testid="markdown-body"
   * @returns {string} The extracted content with spacing preserved
   */
  function extractMarkdownContent() {
    const markdownElements = document.querySelectorAll(
      '[data-testid="markdown-body"]'
    );
    if (markdownElements.length === 0) {
      return null;
    }

    // Extract text from all markdown elements while preserving whitespace
    const contents = Array.from(markdownElements)
      .map((element) => {
        // Clone the element to avoid modifying the page
        const clone = element.cloneNode(true);

        // Convert <br> tags to newlines
        Array.from(clone.querySelectorAll("br")).forEach((br) => {
          br.replaceWith("\n");
        });

        // Handle pre and code blocks to preserve formatting
        Array.from(clone.querySelectorAll("pre, code")).forEach((block) => {
          // Ensure code blocks maintain their whitespace
          block.style.whiteSpace = "pre";
        });

        // Ensure paragraphs have line breaks between them
        Array.from(clone.querySelectorAll("p")).forEach((p) => {
          p.appendChild(document.createTextNode("\n\n"));
        });

        // Handle lists
        Array.from(clone.querySelectorAll("li")).forEach((li) => {
          li.appendChild(document.createTextNode("\n"));
        });

        return clone.textContent;
      })
      .join("\n\n");

    // Normalize line breaks and remove excessive whitespace
    return contents
      .replace(/\n{3,}/g, "\n\n") // Replace 3+ consecutive line breaks with 2
      .trim();
  }

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
   * Initialize the script after UI library has loaded
   */
  async function initializeScript() {
    console.log(" ==> initializeScript function called");

    // Check if button already exists
    if (document.getElementById(CONFIG.buttonId)) {
      console.log(" ==> Button already exists, skipping creation");
      return;
    }

    // Create copy button
    const copyButton = uiManager.addButton({
      id: CONFIG.buttonId,
      text: "Copy Markdown",
      title: "Copy markdown content to clipboard",
      className: "gh-markdown-copy-button",
      onClick: async () => {
        const markdownContent = extractMarkdownContent();

        if (!markdownContent) {
          GM.notification({
            title: "GitHub Markdown Copy",
            text: "No markdown content found on this page.",
            timeout: 3000
          });
          return;
        }

        const success = await copyToClipboard(markdownContent);

        if (success) {
          GM.notification({
            title: "GitHub Markdown Copy",
            text: "Markdown content copied to clipboard!",
            timeout: 2000
          });

          // Visual feedback on button
          copyButton.textContent = "Copied!";
          setTimeout(() => {
            copyButton.textContent = "Copy Markdown";
          }, 2000);
        } else {
          GM.notification({
            title: "GitHub Markdown Copy",
            text: "Failed to copy content to clipboard!",
            timeout: 3000
          });
        }
      }
    });

    console.log(
      " ==> Button created with ID:",
      CONFIG.buttonId,
      "Element:",
      copyButton
    );
  }

  // Initialize the script when the document is ready
  if (document.readyState === "loading") {
    console.log(" ==> Document still loading, waiting for DOMContentLoaded");
    document.addEventListener("DOMContentLoaded", () =>
      uiManager.waitForUILibrary(initializeScript)
    );
  } else {
    console.log(" ==> Document already loaded, waiting for UI library");
    uiManager.waitForUILibrary(initializeScript);
  }

  // Handle GitHub's Turbo navigation for single-page application behavior
  document.addEventListener("turbo:load", () =>
    uiManager.waitForUILibrary(initializeScript)
  );
  document.addEventListener("turbo:render", () =>
    uiManager.waitForUILibrary(initializeScript)
  );
})();
