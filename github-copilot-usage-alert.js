// ==UserScript==
// @name         GitHub Copilot Usage Alert
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Shows Copilot usage excess or deficit percentage on GitHub Copilot features page
// @author       Siew Kam Onn
// @match        https://github.com/settings/copilot/features
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // Styles for the alert message
  const styleContent = `
        .copilot-usage-alert {
            margin-top: 8px;
            font-weight: bold;
            font-size: 14px;
        }
        .copilot-usage-excess {
            color: green;
        }
        .copilot-usage-deficit {
            color: red;
        }
    `;
  const styleSheet = document.createElement("style");
  styleSheet.textContent = styleContent;
  document.head.appendChild(styleSheet);

  /**
   * Parses a percentage string (e.g. "45%") to a float value.
   * @param {string} text - The percentage text to parse
   * @returns {number|null} Parsed percentage or null if invalid
   */
  function parsePercentage(text) {
    const match = text.trim().match(/([0-9]+(?:\.[0-9]+)?)%/);
    return match ? parseFloat(match[1]) : null;
  }

  /**
   * Computes the expected percentage of the month that has elapsed.
   * @returns {number} Expected percentage (0-100)
   */
  function getExpectedPercent() {
    const now = new Date();
    const day = now.getDate();
    const year = now.getFullYear();
    const month = now.getMonth(); // zero-based
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return (day / daysInMonth) * 100;
  }

  /**
   * Inserts the usage alert element into the page.
   * @param {string} message - The alert message text
   * @param {boolean} isExcess - True if excess usage (behind expected), false if deficit (ahead)
   */
  function showUsageAlert(message, isExcess) {
    const container = document.querySelector(
      "#copilot-overages-usage > div > div"
    );
    if (!container) return;

    // Remove any existing alert
    const existing = document.querySelector(".copilot-usage-alert");
    if (existing) existing.remove();

    const alertEl = document.createElement("div");
    alertEl.className = `copilot-usage-alert ${
      isExcess ? "copilot-usage-excess" : "copilot-usage-deficit"
    }`;
    alertEl.textContent = message;
    container.appendChild(alertEl);
  }

  // Add a small in-page widget to show the status. Use shared TampermonkeyUtils.showStatusWidget
  // when available, otherwise fall back to a lightweight fixed-position element.
  function showStatusWidget(text, opts = {}) {
    const optsWithId = {
      id: opts.id || "tm-copilot-usage-alert-widget",
      ...opts,
    };
    if (
      window.TampermonkeyUtils &&
      typeof window.TampermonkeyUtils.showStatusWidget === "function"
    ) {
      try {
        window.TampermonkeyUtils.showStatusWidget(text, optsWithId);
        return;
      } catch (e) {
        // fallthrough to local fallback
      }
    }

    const id = optsWithId.id;
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.style.cssText = `position:fixed;right:${
        optsWithId.position?.right || 20
      }px;bottom:${optsWithId.position?.bottom || 80}px;background:${
        optsWithId.background || "#0d1117"
      };color:${
        optsWithId.color || "#fff"
      };padding:10px 14px;border-radius:8px;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:13px;`;
      document.body.appendChild(el);
    }
    el.textContent = text;
    if (optsWithId.duration && optsWithId.duration > 0) {
      setTimeout(() => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }, optsWithId.duration);
    }
  }

  /**
   * Checks the Copilot usage against expected usage and displays alert.
   */
  function checkCopilotUsage() {
    try {
      const usageEl = document.querySelector(
        "#copilot-overages-usage > div > div > div"
      );
      if (!usageEl) return;

      const percentText = usageEl.textContent || "";
      const actual = parsePercentage(percentText);
      if (actual === null) return;

      const expected = getExpectedPercent();
      const diff = expected - actual;
      const absDiff = Math.abs(diff).toFixed(2);

      if (diff >= 0) {
        // We are using less than expected (excess available)
        showUsageAlert(`Surplus: ${absDiff}%`, true);
      } else {
        // We are using more than expected (deficit)
        showUsageAlert(`Deficit: ${absDiff}%`, false);
      }

      // In-page optional notification (preferred to GM_notification)
      showStatusWidget(
        diff >= 0
          ? `Copilot: used ${absDiff}% less than expected month-to-date.`
          : `Copilot: used ${absDiff}% more than expected month-to-date.`,
        { duration: 5000 }
      );
    } catch (err) {
      console.error("Copilot Usage Alert error:", err);
    }
  }

  /**
   * Initializes the script when the target container becomes available.
   */
  function initialize() {
    const container = document.querySelector("#copilot-overages-usage");
    if (container) {
      checkCopilotUsage();
    } else {
      // Retry if container not yet loaded
      setTimeout(initialize, 300);
    }
  }

  // Run on initial load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
