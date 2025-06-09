// ==UserScript==
// @name         Our Daily Bread Plus
// @namespace    http://tampermonkey.net/
// @version      2025-06-09
// @description  Our Daily Bread Plus
// @author       You
// @match        https://www.odb.org/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=odb.org
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  /**
   * Waits for an element to appear in the DOM
   * @param {string} selector - CSS selector for the element
   * @param {number} timeout - Maximum time to wait in milliseconds
   * @returns {Promise<Element|null>} - Resolves with the element or null if timeout
   */
  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const element = document.querySelector(selector);
        if (element) {
          obs.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Timeout fallback
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  /**
   * Opens the "Read Today" link in a new tab
   */
  async function openReadTodayInNewTab() {
    try {
      console.log("ODB Plus: Looking for read-today element...");

      const readTodayElement = await waitForElement("a.read-today");

      if (readTodayElement) {
        const href = readTodayElement.href;
        if (href) {
          console.log("ODB Plus: Opening read-today link in new tab:", href);
          window.open(href, "_blank");

          // Visual feedback
          const originalText = readTodayElement.textContent;
          readTodayElement.textContent = "Opened in new tab!";
          readTodayElement.style.color = "#28a745";

          setTimeout(() => {
            readTodayElement.textContent = originalText;
            readTodayElement.style.color = "";
          }, 2000);
        } else {
          console.warn(
            "ODB Plus: read-today element found but no href attribute"
          );
        }
      } else {
        console.warn("ODB Plus: Could not find a.read-today element");
      }
    } catch (error) {
      console.error("ODB Plus: Error opening read-today link:", error);
    }
  }

  /**
   * Initialize the script when DOM is ready
   */
  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", openReadTodayInNewTab);
    } else {
      openReadTodayInNewTab();
    }
  }

  // Start the script
  init();
})();
