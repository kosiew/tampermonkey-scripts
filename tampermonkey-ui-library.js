// ==UserScript==
// @name         Tampermonkey UI Library
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Shared UI library for Tampermonkey scripts
// @author       You
// @match        https://github.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  /**
   * TampermonkeyUI - A reusable class for creating UI elements across Tampermonkey scripts
   */
  class TampermonkeyUI {
    /**
     * Creates a new instance of TampermonkeyUI
     * @param {Object} options - Configuration options
     * @param {string} options.containerClass - Class name for the container
     * @param {string} options.containerParent - Selector for the parent element to insert the container after
     */
    constructor(options = {}) {
      this.containerClass = options.containerClass || "tm-scripts-container";
      this.containerParent = options.containerParent || ".Header";

      // Initialize styles
      this.addStyles();
    }

    /**
     * Adds required CSS styles to the document
     * @returns {void}
     */
    addStyles() {
      const styles = document.createElement("style");
      styles.textContent = `
                .${this.containerClass} {
                    position: fixed;
                    top: 10px;
                    right: 20px;
                    display: flex;
                    gap: 10px;
                    z-index: 100;
                    align-items: center;
                }
                
                .${this.containerClass} button {
                    padding: 6px 12px;
                    background-color: #2ea44f;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-weight: bold;
                    cursor: pointer;
                    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
                    transition: background-color 0.2s;
                    font-size: 12px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                }
                
                .${this.containerClass} button:hover {
                    background-color: #2c974b;
                }
                
                .${this.containerClass} button.active {
                    background-color: #cf222e;
                }
                
                .${this.containerClass} button.active:hover {
                    background-color: #a40e26;
                }
            `;
      document.head.appendChild(styles);
    }

    /**
     * Gets or creates the shared container
     * @returns {HTMLElement} The container element
     */
    getContainer() {
      // Check if container already exists
      let container = document.querySelector(`.${this.containerClass}`);

      if (!container) {
        // Create new container
        container = document.createElement("div");
        container.className = this.containerClass;

        // Insert after parent element for better positioning
        const parent = document.querySelector(this.containerParent);
        if (parent && parent.parentNode) {
          parent.parentNode.insertBefore(container, parent.nextSibling);
        } else {
          // Fallback to body if parent not found
          document.body.appendChild(container);
        }
      }

      return container;
    }

    /**
     * Adds a button to the container
     * @param {Object} options - Button options
     * @param {string} options.id - Button ID
     * @param {string} options.text - Button text
     * @param {string} options.title - Button title (tooltip)
     * @param {Function} options.onClick - Click event handler
     * @param {boolean} options.active - Whether the button is active
     * @returns {HTMLElement} The created button
     */
    addButton(options = {}) {
      const container = this.getContainer();

      const button = document.createElement("button");
      if (options.id) button.id = options.id;
      button.textContent = options.text || "Button";
      if (options.title) button.title = options.title;

      if (options.active) button.classList.add("active");

      container.appendChild(button);

      if (typeof options.onClick === "function") {
        button.addEventListener("click", options.onClick);
      }

      return button;
    }

    /**
     * Shows temporary feedback message
     * @param {string} message - The message to display
     * @param {Object} options - Options for the feedback
     * @param {number} options.duration - Duration to show the message in ms
     * @returns {void}
     */
    showFeedback(message, options = {}) {
      const duration = options.duration || 3000;

      const feedback = document.createElement("div");
      feedback.style.cssText = `
                position: fixed;
                bottom: 80px;
                right: 20px;
                padding: 10px 15px;
                background-color: #0d1117;
                color: white;
                border-radius: 6px;
                z-index: 101;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                opacity: 0;
                transition: opacity 0.3s;
            `;
      feedback.textContent = message;

      document.body.appendChild(feedback);

      // Animate in
      setTimeout(() => {
        feedback.style.opacity = "1";
      }, 10);

      // Remove after delay
      setTimeout(() => {
        feedback.style.opacity = "0";
        setTimeout(() => {
          document.body.removeChild(feedback);
        }, 300);
      }, duration);
    }
  }

  // Expose the class to global window object for other scripts to access
  window.TampermonkeyUI = TampermonkeyUI;
})();
