// ==UserScript==
// @name         Auto Close Tab
// @namespace    http://tampermonkey.net/
// @version      2023-06-15
// @description  Automatically closes tabs that match specified URLs
// @author       You
// @match        https://ultimatesurferprotector.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ultimatesurferprotector.com
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  /**
   * Automatically closes the current tab after a short delay
   * This provides a small window for the user to see what's happening
   * before the tab is automatically closed
   */
  function autoCloseTab() {
    try {
      console.log("Auto-close script activated. Closing tab in 500ms...");

      // Short timeout to ensure the tab has time to fully load before closing
      setTimeout(() => {
        window.close();

        // Fallback in case window.close() is blocked by the browser
        if (document.visibilityState !== "hidden") {
          console.log(
            "Direct window.close failed. Attempting alternative close method..."
          );
          window.location.href = "about:blank";
        }
      }, 500);
    } catch (error) {
      console.error("Error in auto-close script:", error);
    }
  }

  // Execute the auto-close function
  autoCloseTab();
})();
