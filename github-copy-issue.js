// ==UserScript==
// @name         GitHub Issue/PR Copy
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Adds a button to copy issue/PR content and comments from GitHub pages
// @author       Siew Kam Onn
// @match        https://github.com/*/issues/*
// @match        https://github.com/*/pull/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @require      https://raw.githubusercontent.com/kosiew/tampermonkey-scripts/refs/heads/main/tampermonkey-ui-library.js
// @grant        GM.notification
// ==/UserScript==

(function () {
  "use strict";

  console.log(" ==> GitHub Issue/PR Copy script started");

  const CONFIG = {
    buttonId: "gh-markdown-copy-button"
  };

  const IS_PULL_REQUEST_PAGE = window.location.href.match(/https:\/\/github\.com\/.*\/pull\/\d+/);
  const IS_ISSUE_PAGE = window.location.href.match(/https:\/\/github\.com\/.*\/issues\/\d+/);

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
   * Extracts comprehensive content from issues/PRs including main content and all comments
   * @returns {string} Formatted content with URLs and proper markdown
   */
  function extractAllContent() {
    const pageTitle = document.querySelector('h1.gh-header-title, h1.title')?.textContent?.trim() || '';
    const pageUrl = window.location.href;
    const repoUrl = pageUrl.match(/^(https:\/\/github\.com\/[^\/]+\/[^\/]+)/)?.[1] || '';
    
    let content = `# ${pageTitle}\n\n`;
    content += `**URL:** ${pageUrl}\n\n`;
    
    // Get main content (issue/PR description)
    const mainContent = extractMainContent();
    if (mainContent) {
      content += `## ${IS_PULL_REQUEST_PAGE ? 'PR Description' : 'Issue Description'}\n\n${mainContent}\n\n`;
    }
    
    // Get all comments
    const comments = extractComments();
    if (comments.length > 0) {
      content += `## Comments\n\n${comments.join('\n\n---\n\n')}`;
    }
    
    return content;
  }

  /**
   * Extracts the main issue/PR description content
   * @returns {string} Formatted markdown content
   */
  function extractMainContent() {
    const container = document.querySelector('[data-testid="issue-viewer-container"], .js-issue-markdown');
    if (!container) return null;
    
    const markdownElement = container.querySelector('[data-testid="markdown-body"]');
    if (!markdownElement) return null;
    
    return processElementToMarkdown(markdownElement);
  }

  /**
   * Extracts all comments from the issue/PR
   * @returns {Array<string>} Array of formatted comment contents
   */
  function extractComments() {
    const comments = [];
    
    // Find all comment containers
    const commentSelectors = [
      '[data-testid="comment-viewer-container"]',
      '.timeline-comment',
      '.comment',
      '.review-comment'
    ];
    
    let commentElements = [];
    commentSelectors.forEach(selector => {
      commentElements.push(...document.querySelectorAll(selector));
    });
    
    commentElements.forEach((comment, index) => {
      const author = comment.querySelector('.author, .comment-author')?.textContent?.trim() || 'Unknown';
      const timestamp = comment.querySelector('relative-time, .timestamp')?.getAttribute('datetime') || 
                       comment.querySelector('relative-time, .timestamp')?.textContent?.trim() || '';
      const permalink = comment.querySelector('a[href*="#issuecomment-"], a[href*="#discussion_r"]')?.href || '';
      
      const markdownBody = comment.querySelector('[data-testid="markdown-body"], .comment-body');
      if (markdownBody) {
        const content = processElementToMarkdown(markdownBody);
        let commentContent = `**Comment by ${author}**`;
        if (timestamp) commentContent += ` - ${timestamp}`;
        if (permalink) commentContent += `\n${permalink}`;
        commentContent += `\n\n${content}`;
        
        comments.push(commentContent);
      }
    });
    
    return comments;
  }

  /**
   * Converts DOM element to markdown format with proper URL handling
   * @param {HTMLElement} element - DOM element to process
   * @returns {string} Markdown formatted content
   */
  function processElementToMarkdown(element) {
    const clone = element.cloneNode(true);
    
    // Process links to include URLs
    Array.from(clone.querySelectorAll('a')).forEach(link => {
      const href = link.href;
      const text = link.textContent.trim();
      
      if (href && text) {
        const markdownLink = text === href ? href : `[${text}](${href})`;
        link.replaceWith(document.createTextNode(markdownLink));
      }
    });
    
    // Process images to include URLs
    Array.from(clone.querySelectorAll('img')).forEach(img => {
      const src = img.src;
      const alt = img.alt || 'image';
      const markdownImage = `![${alt}](${src})`;
      img.replaceWith(document.createTextNode(markdownImage));
    });
    
    // Handle code blocks
    Array.from(clone.querySelectorAll('pre')).forEach(pre => {
      const code = pre.querySelector('code');
      if (code) {
        const language = code.className.match(/language-(\w+)/)?.[1] || '';
        const content = code.textContent.trim();
        pre.replaceWith(document.createTextNode(`\n\`\`\`${language}\n${content}\n\`\`\`\n`));
      } else {
        const content = pre.textContent.trim();
        pre.replaceWith(document.createTextNode(`\n\`\`\`\n${content}\n\`\`\`\n`));
      }
    });
    
    // Handle inline code
    Array.from(clone.querySelectorAll('code')).forEach(code => {
      if (!code.closest('pre')) {
        const content = code.textContent.trim();
        code.replaceWith(document.createTextNode(`\`${content}\``));
      }
    });
    
    // Handle headers
    Array.from(clone.querySelectorAll('h1, h2, h3, h4, h5, h6')).forEach(header => {
      const level = parseInt(header.tagName.substring(1));
      const content = header.textContent.trim();
      const prefix = '#'.repeat(level) + ' ';
      header.replaceWith(document.createTextNode(`\n${prefix}${content}\n\n`));
    });
    
    // Handle lists
    Array.from(clone.querySelectorAll('ul li')).forEach(li => {
      const content = li.textContent.trim();
      li.replaceWith(document.createTextNode(`- ${content}\n`));
    });
    
    Array.from(clone.querySelectorAll('ol li')).forEach((li, index) => {
      const content = li.textContent.trim();
      li.replaceWith(document.createTextNode(`${index + 1}. ${content}\n`));
    });
    
    // Handle bold and italic
    Array.from(clone.querySelectorAll('strong, b')).forEach(b => {
      const content = b.textContent.trim();
      b.replaceWith(document.createTextNode(`**${content}**`));
    });
    
    Array.from(clone.querySelectorAll('em, i')).forEach(i => {
      const content = i.textContent.trim();
      i.replaceWith(document.createTextNode(`*${content}*`));
    });
    
    // Handle line breaks
    Array.from(clone.querySelectorAll('br')).forEach(br => {
      br.replaceWith(document.createTextNode('\n'));
    });
    
    // Handle paragraphs
    Array.from(clone.querySelectorAll('p')).forEach(p => {
      p.appendChild(document.createTextNode('\n\n'));
    });
    
    // Clean up excessive whitespace
    let text = clone.textContent
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .replace(/ {2,}/g, ' ')
      .trim();
    
    return text;
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

    // Check if the current URL matches an issue or PR page
    if (!IS_ISSUE_PAGE && !IS_PULL_REQUEST_PAGE) {
      console.log(" ==> Not an issue or PR page, skipping button creation");
      return;
    }

    // Check if button already exists
    if (document.getElementById(CONFIG.buttonId)) {
      console.log(" ==> Button already exists, skipping creation");
      return;
    }

    // Create copy button
    const buttonText = IS_PULL_REQUEST_PAGE ? "Copy PR" : "Copy Issue";
    const copyButton = uiManager.addButton({
      id: CONFIG.buttonId,
      text: buttonText,
      title: `Copy ${IS_PULL_REQUEST_PAGE ? 'PR' : 'issue'} content and comments to clipboard`,
      className: "gh-markdown-copy-button",
      onClick: async () => {
        const allContent = extractAllContent();

        if (!allContent) {
          GM.notification({
            title: "GitHub Copy",
            text: "No content found on this page.",
            timeout: 3000
          });
          return;
        }

        const success = await copyToClipboard(allContent);

        if (success) {
          // Visual feedback on button
          copyButton.textContent = "Copied!";
          setTimeout(() => {
            copyButton.textContent = buttonText;
          }, 2000);
          
          GM.notification({
            title: "GitHub Copy",
            text: `${IS_PULL_REQUEST_PAGE ? 'PR' : 'Issue'} content copied to clipboard!`,
            timeout: 3000
          });
        } else {
          GM.notification({
            title: "GitHub Copy",
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
  document.addEventListener("turbo:load", () => {
    uiManager.waitForUILibrary(initializeScript);
  });
  document.addEventListener("turbo:render", () => {
    uiManager.waitForUILibrary(initializeScript);
  });
})();
