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
      this.dragHandleClass = `${this.containerClass}-drag-handle`;
      this.dragState = {
        active: false,
        pointerId: null,
        offsetX: 0,
        offsetY: 0,
      };

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
                    top: 60px; /* Increased from 10px to avoid overlapping with GitHub's header UI */
                    right: 20px;
                    display: flex;
                    gap: 10px;
                    z-index: 100;
                    align-items: center;
                  background-color: rgba(255, 214, 102, 0.95);
                    padding: 5px;
                    border-radius: 6px;
            user-select: none;
                }

                .${this.dragHandleClass} {
                  display: inline-flex;
                  align-items: center;
                  gap: 6px;
                  padding: 6px 10px;
                  border-radius: 6px;
                  background: rgba(27, 31, 36, 0.08);
                  color: #24292f;
                  font-size: 12px;
                  font-weight: 600;
                  cursor: grab;
                  touch-action: none;
                  white-space: nowrap;
                }

                .${this.dragHandleClass}:hover,
                .${this.dragHandleClass}.dragging {
                  cursor: grabbing;
                  background: rgba(27, 31, 36, 0.14);
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
      (document.head || document.documentElement).appendChild(styles);
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
        container.dataset.tmHandleReady = "false";

        // Insert after parent element for better positioning
        const parent = document.querySelector(this.containerParent);
        if (parent && parent.parentNode) {
          parent.parentNode.insertBefore(container, parent.nextSibling);
        } else {
          // Fallback to body if parent not found
          document.body.appendChild(container);
        }
      }

      this.makeDraggable(container);

      return container;
    }

    /**
     * Makes the shared container draggable.
     * @param {HTMLElement} container - The container element
     * @returns {void}
     */
    makeDraggable(container) {
      if (container.dataset.tmDraggable === "true") {
        return;
      }

      container.dataset.tmDraggable = "true";

      let handle = container.querySelector(`.${this.dragHandleClass}`);

      if (!handle) {
        handle = document.createElement("div");
        handle.className = this.dragHandleClass;
        handle.textContent = "Drag";
        container.insertBefore(handle, container.firstChild);
      }

      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;

        const rect = container.getBoundingClientRect();

        container.style.left = `${rect.left}px`;
        container.style.top = `${rect.top}px`;
        container.style.right = "auto";
        container.style.bottom = "auto";

        this.dragState.active = true;
        this.dragState.pointerId = event.pointerId;
        this.dragState.offsetX = event.clientX - rect.left;
        this.dragState.offsetY = event.clientY - rect.top;
        this.dragState.moved = false;
        handle.classList.add("dragging");

        if (container.setPointerCapture) {
          container.setPointerCapture(event.pointerId);
        }

        event.preventDefault();
      });

      window.addEventListener("pointermove", (event) => {
        if (
          !this.dragState.active ||
          event.pointerId !== this.dragState.pointerId
        ) {
          return;
        }

        const containerWidth = container.offsetWidth;
        const containerHeight = container.offsetHeight;
        const maxLeft = Math.max(0, window.innerWidth - containerWidth);
        const maxTop = Math.max(0, window.innerHeight - containerHeight);
        const nextLeft = Math.min(
          Math.max(0, event.clientX - this.dragState.offsetX),
          maxLeft,
        );
        const nextTop = Math.min(
          Math.max(0, event.clientY - this.dragState.offsetY),
          maxTop,
        );

        container.style.left = `${nextLeft}px`;
        container.style.top = `${nextTop}px`;
        container.style.right = "auto";
        container.style.bottom = "auto";
        this.dragState.moved = true;

        event.preventDefault();
      });

      const endDrag = (event) => {
        if (
          !this.dragState.active ||
          event.pointerId !== this.dragState.pointerId
        ) {
          return;
        }

        this.dragState.active = false;
        this.dragState.pointerId = null;
        handle.classList.remove("dragging");

        if (this.dragState.moved) {
          container.dataset.tmManualPosition = "true";
        }
      };

      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
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

    /**
     * Updates the container position based on page layout
     * Can be called when page content changes significantly
     * @returns {void}
     */
    updateContainerPosition() {
      const container = this.getContainer();
      if (!container) return;

      if (container.dataset.tmManualPosition === "true") {
        return;
      }

      // Position the container below the GitHub header
      const header = document.querySelector(this.containerParent);
      if (header) {
        const headerRect = header.getBoundingClientRect();
        container.style.top = `${headerRect.bottom + 10}px`;
      }
    }
  }

  // Initialize container position when page is ready
  document.addEventListener("DOMContentLoaded", () => {
    // Wait for GitHub UI to fully render before positioning
    setTimeout(() => {
      if (window.TampermonkeyUI) {
        // Create a temporary instance just to update any existing containers
        const tempUI = new TampermonkeyUI();
        tempUI.updateContainerPosition();
      }
    }, 500);
  });

  // Handle window resize events to reposition the container
  window.addEventListener("resize", () => {
    if (window.TampermonkeyUI) {
      const tempUI = new TampermonkeyUI();
      tempUI.updateContainerPosition();
    }
  });

  // Expose the class to global window object for other scripts to access
  window.TampermonkeyUI = TampermonkeyUI;
})();
