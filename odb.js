// ==UserScript==
// @name         Our Daily Bread Plus
// @namespace    http://tampermonkey.net/
// @version      2025-06-09
// @description  Our Daily Bread Plus
// @author       You
// @match        https://www.odb.org/
// @match        https://odb.org/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=odb.org
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  console.log("==> ODB Plus script loaded and starting...");
  console.log("==> Current URL:", window.location.href);
  console.log("==> Document ready state:", document.readyState);

  // Debug mode - set to true to bypass session storage check
  const DEBUG_MODE = true;
  console.log("==> Debug mode:", DEBUG_MODE);

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
      console.log("==> Starting waitForReadTodayWithHref function");

      const checkElement = () => {
        console.log("==> Checking for a.read-today element...");
        const element = document.querySelector("a.read-today");
        console.log("==> Element found:", element);

        if (element) {
          const href = element.getAttribute("href");
          console.log("==> Element href attribute:", href);
          console.log("==> Element full href property:", element.href);
          console.log("==> Element text content:", element.textContent);
          console.log("==> Element classes:", element.className);

          // Check if href is not just "/" and contains a date pattern
          if (href && href !== "/" && href.includes("/")) {
            console.log("==> Found element with proper href:", href);
            resolve(element);
            return true;
          } else {
            console.log("==> Element found but href is invalid:", href);
          }
        } else {
          console.log("==> No a.read-today element found");
          // Let's check what read-today elements we do have
          const readTodayElements = document.querySelectorAll(".read-today");
          console.log(
            "==> Found",
            readTodayElements.length,
            "elements with .read-today class:"
          );
          readTodayElements.forEach((el, index) => {
            console.log(
              `==> Element ${index}:`,
              el.tagName,
              el.className,
              el.textContent
            );
          });
        }
        return false;
      };

      // Check immediately
      console.log("==> Performing initial check...");
      if (checkElement()) return;

      console.log("==> Setting up MutationObserver...");
      const observer = new MutationObserver((mutations, obs) => {
        console.log(
          "==> MutationObserver triggered with",
          mutations.length,
          "mutations"
        );
        if (checkElement()) {
          console.log(
            "==> Element found via MutationObserver, disconnecting..."
          );
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
        console.log("==> Timeout reached, disconnecting observer");
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  // Flag to prevent multiple executions
  const SESSION_KEY = "odb-plus-executed";

  /**
   * Opens the "Read Today" link in a new tab automatically
   */  async function openReadTodayInNewTab() {
    console.log("==> openReadTodayInNewTab function called");
    
    // Check session storage value
    const sessionValue = sessionStorage.getItem(SESSION_KEY);
    console.log("==> Session storage value for", SESSION_KEY, ":", sessionValue);
    
    // Prevent multiple executions using sessionStorage (unless in debug mode)
    if (sessionValue && !DEBUG_MODE) {
      console.log(
        "ODB Plus: Script already executed in this session, skipping"
      );
      console.log("==> To test again, clear session storage or reload in new tab");
      return;
    }

    if (sessionValue && DEBUG_MODE) {
      console.log("==> Debug mode enabled, bypassing session storage check");
    }

    console.log("==> Session check passed, proceeding...");

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
    console.log("==> Init function called");
    console.log("==> Document ready state in init:", document.readyState);

    if (document.readyState === "loading") {
      console.log(
        "==> Document still loading, adding DOMContentLoaded listener"
      );
      document.addEventListener("DOMContentLoaded", () => {
        console.log("==> DOMContentLoaded event fired");
        openReadTodayInNewTab();
      });
    } else {
      console.log(
        "==> Document already ready, calling openReadTodayInNewTab immediately"
      );
      openReadTodayInNewTab();
    }
  }

  // Start the script
  console.log("==> About to call init()");
  init();
  console.log("==> Script initialization complete");
})();
