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
   * Waits for the read-today element to have a proper href (not just "/")
   * @param {number} timeout - Maximum time to wait in milliseconds
   * @returns {Promise<Element|null>} - Resolves with the element when href is loaded
   */
  function waitForReadTodayWithHref(timeout = 15000) {
    return new Promise((resolve) => {
      const checkElement = () => {
        const element = document.querySelector("a.read-today");
        if (element) {
          const href = element.getAttribute("href");
          // Check if href is not just "/" and contains a date pattern
          if (href && href !== "/" && href.includes("/")) {
            console.log("ODB Plus: Found element with proper href:", href);
            resolve(element);
            return true;
          }
        }
        return false;
      };

      // Check immediately
      if (checkElement()) return;

      const observer = new MutationObserver((mutations, obs) => {
        if (checkElement()) {
          obs.disconnect();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["href"]
      });

      // Timeout fallback
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  // Flag to prevent multiple executions
  const SESSION_KEY = "odb-plus-executed";

  /**
   * Opens the "Read Today" link in a new tab automatically
   */
  async function openReadTodayInNewTab() {
    // Prevent multiple executions using sessionStorage
    if (sessionStorage.getItem(SESSION_KEY)) {
      console.log(
        "ODB Plus: Script already executed in this session, skipping"
      );
      return;
    }

    try {
      console.log(
        "ODB Plus: Looking for read-today element with proper href..."
      );

      const readTodayElement = await waitForReadTodayWithHref();

      if (readTodayElement) {
        // Mark as executed in sessionStorage
        sessionStorage.setItem(SESSION_KEY, "true");

        // Get the raw href attribute (relative path)
        const rawHref = readTodayElement.getAttribute("href");
        // Construct full URL
        const fullUrl = rawHref.startsWith("http")
          ? rawHref
          : `https://www.odb.org${rawHref}`;

        console.log("ODB Plus: Found read-today element:", readTodayElement);
        console.log("ODB Plus: Raw href attribute:", rawHref);
        console.log("ODB Plus: Full URL to open:", fullUrl);

        if (rawHref && rawHref !== "/") {
          // Open the link in a new tab
          const newWindow = window.open(fullUrl, "_blank");

          if (newWindow) {
            console.log("ODB Plus: Successfully opened new tab");

            // Visual feedback
            const originalText = readTodayElement.textContent;
            readTodayElement.textContent = "✓ Opened in new tab!";
            readTodayElement.style.color = "#28a745";
            readTodayElement.style.fontWeight = "bold";

            setTimeout(() => {
              readTodayElement.textContent = originalText;
              readTodayElement.style.color = "";
              readTodayElement.style.fontWeight = "";
            }, 3000);
          } else {
            console.error("ODB Plus: Failed to open new tab (popup blocked?)");
            alert(
              "ODB Plus: Unable to open new tab. Please check popup blocker settings."
            );
          }
        } else {
          console.warn("ODB Plus: read-today element found but no href");
        }
      } else {
        console.warn("ODB Plus: Could not find a.read-today element");
        // Let's also check what elements we do have
        const allReadToday = document.querySelectorAll(".read-today");
        const allAnchors = document.querySelectorAll("a");
        console.log(
          "ODB Plus: Found",
          allReadToday.length,
          "elements with .read-today class"
        );
        console.log(
          "ODB Plus: Found",
          allAnchors.length,
          "anchor elements total"
        );
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
